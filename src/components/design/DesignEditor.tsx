import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * In-iframe WYSIWYG editor for generated design HTML.
 *
 * Guardrails (strict):
 * - Text editing only on leaf text-bearing tags (h1-h6, p, li, a, button, span,
 *   strong, em, small, blockquote, td, th, label, figcaption). Newlines are
 *   blocked so users cannot break the layout by hitting Enter inside a heading.
 * - Block reordering is sibling-only: a block can only be dropped between its
 *   immediate siblings under the same parent. Cross-container moves are
 *   rejected.
 * - No deletes, duplicates, or structural changes are allowed.
 */
export interface DesignEditorHandle {
  /** Read the current edited HTML out of the iframe, stripped of editor attrs. */
  getEditedHtml: () => Promise<string>;
  undo: () => void;
  redo: () => void;
}

export interface DesignEditorState {
  canUndo: boolean;
  canRedo: boolean;
}

interface Props {
  html: string;
  editMode: boolean;
  onStateChange?: (state: DesignEditorState) => void;
}

const EDITOR_SCRIPT = `
(function(){
  if (window.__deInstalled) return; window.__deInstalled = true;

  var STYLE = ''+
    '[data-de-block]{transition:outline-color .1s;}'+
    '[data-de-block]:hover{outline:2px dashed rgba(99,102,241,.6);outline-offset:2px;cursor:grab;}'+
    '[data-de-text]:hover{outline:2px dashed rgba(16,185,129,.6);outline-offset:2px;cursor:text;}'+
    '[data-de-text]:focus{outline:2px solid #10b981;outline-offset:2px;cursor:text;}'+
    '[data-de-selected]{outline:2px solid #6366f1!important;outline-offset:2px;}'+
    '[data-de-dragging]{opacity:.4;}'+
    '[data-de-drop-before]{box-shadow:inset 0 4px 0 0 #6366f1!important;}'+
    '[data-de-drop-after]{box-shadow:inset 0 -4px 0 0 #6366f1!important;}'+
    '[data-de-drop-inside]{box-shadow:inset 0 0 0 3px #6366f1!important;}'+
    '#__de_toolbar{position:fixed;z-index:2147483647;display:flex;gap:2px;padding:3px;background:#111827;color:#fff;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.25);font:500 11px system-ui,sans-serif;}'+
    '#__de_toolbar button{appearance:none;border:0;background:transparent;color:#fff;padding:3px 6px;border-radius:4px;cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:4px;}'+
    '#__de_toolbar button:hover{background:rgba(255,255,255,.15);}'+
    '#__de_toolbar .de-sep{width:1px;background:rgba(255,255,255,.2);margin:2px 2px;}'+
    '#__de_toolbar .de-danger:hover{background:#dc2626;}'+
    '#__de_text_toolbar{position:fixed;z-index:2147483647;display:none;gap:1px;padding:3px;background:#111827;color:#fff;border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,.3);font:500 12px system-ui,sans-serif;}'+
    '#__de_text_toolbar button{appearance:none;border:0;background:transparent;color:#fff;min-width:26px;height:24px;padding:0 6px;border-radius:4px;cursor:pointer;font:inherit;display:inline-flex;align-items:center;justify-content:center;}'+
    '#__de_text_toolbar button:hover{background:rgba(255,255,255,.15);}'+
    '#__de_text_toolbar button[data-active="1"]{background:#6366f1;}'+
    '#__de_text_toolbar .de-sep{width:1px;background:rgba(255,255,255,.2);margin:2px 3px;}'+
    '#__de_text_toolbar .de-b{font-weight:700;}'+
    '#__de_text_toolbar .de-i{font-style:italic;}'+
    '#__de_text_toolbar .de-u{text-decoration:underline;}'+
    '#__de_text_toolbar .de-s{text-decoration:line-through;}';

  var styleEl = document.createElement('style');
  styleEl.id = '__de_style';
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  var SKIP = {SCRIPT:1,STYLE:1,HTML:1,HEAD:1,META:1,LINK:1,BODY:1,NOSCRIPT:1,TITLE:1};
  var TEXT_TAGS = {H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,P:1,LI:1,A:1,BUTTON:1,SPAN:1,STRONG:1,EM:1,SMALL:1,BLOCKQUOTE:1,TD:1,TH:1,LABEL:1,FIGCAPTION:1};
  // Containers we never want to nest into during cross-container moves.
  var ATOMIC = {IMG:1,SVG:1,VIDEO:1,AUDIO:1,IFRAME:1,INPUT:1,TEXTAREA:1,BR:1,HR:1,CANVAS:1};

  var enabled = false;
  var dragSrc = null;
  var selected = null;
  var toolbar = null;
  var textToolbar = null;
  var activeEditable = null;

  // ── Undo/redo (max 5 snapshots) ────────────────────────────────────────
  var UNDO_LIMIT = 5;
  var undoStack = [];
  var redoStack = [];
  var textSnapshotTimer = null;

  function postState(){
    try {
      parent.postMessage({
        type: '__DE_STATE',
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
      }, '*');
    } catch(_){}
  }

  function snapshotHtml(){
    // Clone body and strip transient editor attrs before snapshotting so
    // restoring doesn't bring back stale selection/drag markers.
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll('[data-de-selected],[data-de-dragging],[data-de-drop-before],[data-de-drop-after],[data-de-drop-inside]').forEach(function(el){
      el.removeAttribute('data-de-selected');
      el.removeAttribute('data-de-dragging');
      el.removeAttribute('data-de-drop-before');
      el.removeAttribute('data-de-drop-after');
      el.removeAttribute('data-de-drop-inside');
    });
    // Remove the injected toolbar element from the snapshot.
    var tb = clone.querySelector('#__de_toolbar');
    if (tb) tb.remove();
    return clone.innerHTML;
  }

  function snapshot(){
    var snap = snapshotHtml();
    // Avoid pushing duplicate consecutive snapshots.
    if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    postState();
  }

  function scheduleTextSnapshot(){
    if (textSnapshotTimer) clearTimeout(textSnapshotTimer);
    textSnapshotTimer = setTimeout(function(){
      textSnapshotTimer = null;
      snapshot();
    }, 600);
  }

  function restore(html){
    clearSelection();
    if (toolbar) { toolbar.remove(); toolbar = null; }
    document.body.innerHTML = html;
    // Re-tag the new subtree and rebuild toolbar so editor stays usable.
    if (enabled) {
      tagSubtree(document.body);
      buildToolbar();
    }
  }

  function undo(){
    if (!undoStack.length) return;
    var current = snapshotHtml();
    var prev = undoStack.pop();
    redoStack.push(current);
    if (redoStack.length > UNDO_LIMIT) redoStack.shift();
    restore(prev);
    postState();
  }

  function redo(){
    if (!redoStack.length) return;
    var current = snapshotHtml();
    var next = redoStack.pop();
    undoStack.push(current);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    restore(next);
    postState();
  }
  // ───────────────────────────────────────────────────────────────────────

  function isLeafTextEl(el){
    if (!TEXT_TAGS[el.tagName]) return false;
    // leaf-ish: no child element nodes
    for (var i=0;i<el.childNodes.length;i++){
      if (el.childNodes[i].nodeType === 1) return false;
    }
    return true;
  }

  function buildToolbar(){
    toolbar = document.createElement('div');
    toolbar.id = '__de_toolbar';
    toolbar.style.display = 'none';
    toolbar.innerHTML =
      '<button data-act="up" title="Move up">↑</button>'+
      '<button data-act="down" title="Move down">↓</button>'+
      '<div class="de-sep"></div>'+
      '<button data-act="dup" title="Duplicate">⧉ Duplicate</button>'+
      '<button data-act="del" class="de-danger" title="Delete">✕ Delete</button>';
    toolbar.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    toolbar.addEventListener('click', function(e){
      var b = e.target && e.target.closest && e.target.closest('button');
      if (!b || !selected) return;
      var act = b.getAttribute('data-act');
      if (act === 'del') {
        snapshot();
        var p = selected.parentElement;
        selected.remove();
        clearSelection();
        if (p) reindexParent(p);
      } else if (act === 'dup') {
        snapshot();
        var clone = selected.cloneNode(true);
        // Strip editor attributes from the clone subtree so re-tagging is clean.
        stripEditorAttrs(clone);
        selected.parentElement.insertBefore(clone, selected.nextSibling);
        tagSubtree(clone);
        selectBlock(clone);
      } else if (act === 'up') {
        var prev = selected.previousElementSibling;
        if (prev) { snapshot(); selected.parentElement.insertBefore(selected, prev); }
        positionToolbar();
      } else if (act === 'down') {
        var next = selected.nextElementSibling;
        if (next) { snapshot(); selected.parentElement.insertBefore(next, selected); }
        positionToolbar();
      }
      e.stopPropagation();
    });
    document.body.appendChild(toolbar);
  }

  function buildTextToolbar(){
    textToolbar = document.createElement('div');
    textToolbar.id = '__de_text_toolbar';
    textToolbar.setAttribute('data-de-ui','1');
    textToolbar.innerHTML =
      '<button data-cmd="bold" class="de-b" title="Bold (Ctrl+B)">B</button>'+
      '<button data-cmd="italic" class="de-i" title="Italic (Ctrl+I)">I</button>'+
      '<button data-cmd="underline" class="de-u" title="Underline (Ctrl+U)">U</button>'+
      '<button data-cmd="strikeThrough" class="de-s" title="Strikethrough">S</button>'+
      '<div class="de-sep"></div>'+
      '<button data-cmd="superscript" title="Superscript">x²</button>'+
      '<button data-cmd="subscript" title="Subscript">x₂</button>'+
      '<div class="de-sep"></div>'+
      '<button data-cmd="createLink" title="Add link">🔗</button>'+
      '<button data-cmd="unlink" title="Remove link">⛓̸</button>'+
      '<div class="de-sep"></div>'+
      '<button data-cmd="removeFormat" title="Clear formatting">⌫ₐ</button>';
    // Prevent focus loss so selection is preserved when clicking buttons.
    textToolbar.addEventListener('mousedown', function(e){ e.preventDefault(); e.stopPropagation(); });
    textToolbar.addEventListener('click', function(e){
      var b = e.target && e.target.closest && e.target.closest('button');
      if (!b) return;
      var cmd = b.getAttribute('data-cmd');
      if (!cmd) return;
      // Make sure the editable still owns the selection.
      if (activeEditable) {
        try { activeEditable.focus(); } catch(_){}
      }
      snapshot();
      if (cmd === 'createLink') {
        var url = window.prompt('Link URL', 'https://');
        if (!url) return;
        document.execCommand('createLink', false, url);
      } else {
        document.execCommand(cmd, false, null);
      }
      updateTextToolbarState();
      e.stopPropagation();
    });
    document.body.appendChild(textToolbar);
  }

  function updateTextToolbarState(){
    if (!textToolbar) return;
    var cmds = ['bold','italic','underline','strikeThrough','superscript','subscript'];
    var btns = textToolbar.querySelectorAll('button[data-cmd]');
    for (var i=0;i<btns.length;i++){
      var c = btns[i].getAttribute('data-cmd');
      if (cmds.indexOf(c) === -1) { btns[i].removeAttribute('data-active'); continue; }
      var on = false;
      try { on = document.queryCommandState(c); } catch(_){}
      if (on) btns[i].setAttribute('data-active','1'); else btns[i].removeAttribute('data-active');
    }
  }

  function positionTextToolbar(){
    if (!textToolbar || !activeEditable) return;
    var sel = window.getSelection();
    var rect = null;
    if (sel && sel.rangeCount){
      var range = sel.getRangeAt(0);
      var rr = range.getClientRects();
      if (rr && rr.length) rect = rr[0];
      else { try { rect = range.getBoundingClientRect(); } catch(_){} }
    }
    if (!rect || (rect.width === 0 && rect.height === 0)){
      rect = activeEditable.getBoundingClientRect();
    }
    var top = rect.top - 36;
    if (top < 4) top = rect.bottom + 6;
    var left = rect.left;
    var maxLeft = window.innerWidth - 320;
    if (left > maxLeft) left = Math.max(4, maxLeft);
    if (left < 4) left = 4;
    textToolbar.style.top = top + 'px';
    textToolbar.style.left = left + 'px';
    textToolbar.style.display = 'flex';
    updateTextToolbarState();
  }

  function hideTextToolbar(){
    if (textToolbar) textToolbar.style.display = 'none';
    activeEditable = null;
  }

  function onFocusIn(e){
    if (!enabled) return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('contenteditable') === 'true') {
      activeEditable = t;
      if (!textToolbar) buildTextToolbar();
      positionTextToolbar();
    }
  }

  function onFocusOut(e){
    if (!enabled) return;
    // Defer so clicks on the toolbar (which prevent default focus loss) still work.
    setTimeout(function(){
      var ae = document.activeElement;
      if (!ae || !ae.getAttribute || ae.getAttribute('contenteditable') !== 'true') {
        hideTextToolbar();
      }
    }, 0);
  }

  function onSelectionChange(){
    if (!enabled || !activeEditable) return;
    positionTextToolbar();
  }

  function reindexParent(){ /* placeholder for future ordering hooks */ }

  function tagEl(el){
    if (SKIP[el.tagName]) return;
    if (isLeafTextEl(el)){
      el.setAttribute('contenteditable','true');
      el.setAttribute('data-de-text','1');
      el.setAttribute('spellcheck','true');
    }
    el.setAttribute('draggable','true');
    el.setAttribute('data-de-block','1');
  }

  function tagSubtree(root){
    tagEl(root);
    var nodes = root.querySelectorAll('*');
    for (var i=0;i<nodes.length;i++) tagEl(nodes[i]);
  }

  function stripEditorAttrs(root){
    var EATTRS = ['draggable','contenteditable','spellcheck','data-de-block','data-de-text','data-de-selected','data-de-dragging','data-de-drop-before','data-de-drop-after','data-de-drop-inside'];
    function clean(el){ for (var i=0;i<EATTRS.length;i++) el.removeAttribute(EATTRS[i]); }
    clean(root);
    var nodes = root.querySelectorAll('*');
    for (var i=0;i<nodes.length;i++) clean(nodes[i]);
  }

  function clearSelection(){
    if (selected) selected.removeAttribute('data-de-selected');
    selected = null;
    if (toolbar) toolbar.style.display = 'none';
  }

  function selectBlock(el){
    if (!el) return;
    if (selected && selected !== el) selected.removeAttribute('data-de-selected');
    selected = el;
    el.setAttribute('data-de-selected','1');
    positionToolbar();
  }

  function positionToolbar(){
    if (!toolbar || !selected) return;
    var r = selected.getBoundingClientRect();
    var top = r.top - 32;
    if (top < 4) top = r.bottom + 4;
    var left = r.left;
    if (left < 4) left = 4;
    var maxLeft = window.innerWidth - 220;
    if (left > maxLeft) left = Math.max(4, maxLeft);
    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
    toolbar.style.display = 'flex';
  }

  function enable(){
    if (enabled) return; enabled = true;
    tagSubtree(document.body);
    if (!toolbar) buildToolbar();
    if (!textToolbar) buildTextToolbar();
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('selectionchange', onSelectionChange, true);
    document.addEventListener('keyup', onSelectionChange, true);
    window.addEventListener('scroll', positionToolbar, true);
    window.addEventListener('resize', positionToolbar, true);
    window.addEventListener('scroll', positionTextToolbar, true);
    window.addEventListener('resize', positionTextToolbar, true);
    postState();
  }

  function disable(){
    if (!enabled) return; enabled = false;
    clearSelection();
    hideTextToolbar();
    document.querySelectorAll('[data-de-block]').forEach(function(el){
      el.removeAttribute('draggable');
      el.removeAttribute('data-de-block');
      el.removeAttribute('data-de-dragging');
      el.removeAttribute('data-de-drop-before');
      el.removeAttribute('data-de-drop-after');
      el.removeAttribute('data-de-drop-inside');
      el.removeAttribute('data-de-selected');
    });
    document.querySelectorAll('[data-de-text]').forEach(function(el){
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-de-text');
      el.removeAttribute('spellcheck');
    });
    if (toolbar) toolbar.style.display = 'none';
    if (textToolbar) textToolbar.style.display = 'none';
    document.removeEventListener('dragstart', onDragStart, true);
    document.removeEventListener('dragover', onDragOver, true);
    document.removeEventListener('dragleave', onDragLeave, true);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('dragend', onDragEnd, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('mousedown', onMouseDown, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('selectionchange', onSelectionChange, true);
    document.removeEventListener('keyup', onSelectionChange, true);
    window.removeEventListener('scroll', positionToolbar, true);
    window.removeEventListener('resize', positionToolbar, true);
    window.removeEventListener('scroll', positionTextToolbar, true);
    window.removeEventListener('resize', positionTextToolbar, true);
  }

  function onInput(e){
    if (!enabled) return;
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute('contenteditable') !== 'true') return;
    scheduleTextSnapshot();
  }

  function onClick(e){
    if (!enabled) return;
    var a = e.target && e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); }
  }

  function onMouseDown(e){
    if (!enabled) return;
    if (toolbar && toolbar.contains(e.target)) return;
    // If user clicks text element, let contenteditable take focus and clear block selection.
    if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') {
      clearSelection();
      return;
    }
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (t) selectBlock(t);
    else clearSelection();
  }

  function onKeyDown(e){
    if (!enabled) return;
    if (e.key === 'Escape') { clearSelection(); return; }
    // Undo / redo shortcuts
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
      var ae0 = document.activeElement;
      var editing0 = ae0 && ae0.getAttribute && ae0.getAttribute('contenteditable') === 'true';
      if (!editing0) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
      var ae1 = document.activeElement;
      var editing1 = ae1 && ae1.getAttribute && ae1.getAttribute('contenteditable') === 'true';
      if (!editing1) { e.preventDefault(); redo(); return; }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      var ae = document.activeElement;
      var editing = ae && ae.getAttribute && ae.getAttribute('contenteditable') === 'true';
      if (!editing) {
        e.preventDefault();
        snapshot();
        var p = selected.parentElement;
        selected.remove();
        clearSelection();
        return;
      }
    }
    if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && selected) {
      var ae2 = document.activeElement;
      var editing2 = ae2 && ae2.getAttribute && ae2.getAttribute('contenteditable') === 'true';
      if (!editing2) {
        e.preventDefault();
        snapshot();
        var clone = selected.cloneNode(true);
        stripEditorAttrs(clone);
        selected.parentElement.insertBefore(clone, selected.nextSibling);
        tagSubtree(clone);
        selectBlock(clone);
        return;
      }
    }
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute('contenteditable') !== 'true') return;
    // Block Enter to keep one-line elements intact.
    if (e.key === 'Enter') { e.preventDefault(); return; }
  }

  function onPaste(e){
    if (!enabled) return;
    var t = e.target;
    if (!t || !t.getAttribute || t.getAttribute('contenteditable') !== 'true') return;
    // Force plain-text paste so rich content can't smuggle in tags/styles.
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    text = text.replace(/\\r?\\n/g, ' ');
    document.execCommand('insertText', false, text);
  }

  function onDragStart(e){
    if (!enabled) return;
    // Don't drag when the user is editing text.
    if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') {
      e.preventDefault(); return;
    }
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (!t) return;
    dragSrc = t;
    // Snapshot before any potential move/drop mutation.
    snapshot();
    t.setAttribute('data-de-dragging','1');
    clearSelection();
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain','de'); } catch(_){}
    e.stopPropagation();
  }

  function onDragOver(e){
    if (!enabled || !dragSrc) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (!t || t === dragSrc) return;
    // Disallow dropping a node into its own descendant (would detach the source).
    if (dragSrc.contains(t)) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch(_){}
    clearMarkers();
    var r = t.getBoundingClientRect();
    var y = e.clientY - r.top;
    var canNest = !ATOMIC[t.tagName] && !t.hasAttribute('data-de-text') && t !== dragSrc;
    // Bands: top 30% = before, bottom 30% = after, middle = nest inside (if allowed)
    if (canNest && y > r.height * 0.3 && y < r.height * 0.7) {
      t.setAttribute('data-de-drop-inside','1');
    } else {
      var before = y < r.height / 2;
      t.setAttribute(before ? 'data-de-drop-before' : 'data-de-drop-after','1');
    }
    e.stopPropagation();
  }

  function onDragLeave(e){
    if (!enabled) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (t){
      t.removeAttribute('data-de-drop-before');
      t.removeAttribute('data-de-drop-after');
      t.removeAttribute('data-de-drop-inside');
    }
  }

  function onDrop(e){
    if (!enabled || !dragSrc) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (!t || t === dragSrc) return;
    if (dragSrc.contains(t)) return;
    e.preventDefault();
    var r = t.getBoundingClientRect();
    var y = e.clientY - r.top;
    var canNest = !ATOMIC[t.tagName] && !t.hasAttribute('data-de-text');
    if (canNest && y > r.height * 0.3 && y < r.height * 0.7) {
      t.appendChild(dragSrc);
    } else {
      var before = y < r.height / 2;
      if (before) t.parentElement.insertBefore(dragSrc, t);
      else t.parentElement.insertBefore(dragSrc, t.nextSibling);
    }
    clearMarkers();
    e.stopPropagation();
  }

  function onDragEnd(){
    if (dragSrc) dragSrc.removeAttribute('data-de-dragging');
    dragSrc = null;
    clearMarkers();
  }

  function clearMarkers(){
    document.querySelectorAll('[data-de-drop-before],[data-de-drop-after],[data-de-drop-inside]').forEach(function(el){
      el.removeAttribute('data-de-drop-before');
      el.removeAttribute('data-de-drop-after');
      el.removeAttribute('data-de-drop-inside');
    });
  }

  function getCleanHtml(){
    var was = enabled;
    if (was) disable();
    if (toolbar) toolbar.remove();
    toolbar = null;
    if (textToolbar) textToolbar.remove();
    textToolbar = null;
    var html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
    // Strip our injected style tag regardless.
    html = html.replace(/<style[^>]*id="__de_style"[\\s\\S]*?<\\/style>/i, '');
    html = html.replace(/<div[^>]*id="__de_toolbar"[\\s\\S]*?<\\/div>/i, '');
    html = html.replace(/<div[^>]*id="__de_text_toolbar"[\\s\\S]*?<\\/div>/i, '');
    if (was) enable();
    return html;
  }

  window.addEventListener('message', function(ev){
    var d = ev.data || {};
    if (d.type === '__DE_ENABLE') enable();
    else if (d.type === '__DE_DISABLE') disable();
    else if (d.type === '__DE_UNDO') undo();
    else if (d.type === '__DE_REDO') redo();
    else if (d.type === '__DE_GET') {
      var html = getCleanHtml();
      try { parent.postMessage({type:'__DE_HTML', reqId:d.reqId, html:html}, '*'); } catch(_){}
    }
  });

  try { parent.postMessage({type:'__DE_READY'}, '*'); } catch(_){}
})();
`;

const DesignEditor = forwardRef<DesignEditorHandle, Props>(({ html, editMode, onStateChange }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  // Listen for state messages from the iframe to surface undo/redo availability.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d: any = e.data;
      if (d && d.type === "__DE_STATE") {
        onStateChangeRef.current?.({ canUndo: !!d.canUndo, canRedo: !!d.canRedo });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // (Re)write document whenever the source HTML changes.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    readyRef.current = false;
    doc.open();
    doc.write(html || "<!DOCTYPE html><html><body></body></html>");
    doc.close();
    // Inject editor script
    const s = doc.createElement("script");
    s.textContent = EDITOR_SCRIPT;
    (doc.body || doc.documentElement).appendChild(s);
    readyRef.current = true;
    // Re-apply current mode after reload
    iframe.contentWindow?.postMessage(
      { type: editMode ? "__DE_ENABLE" : "__DE_DISABLE" },
      "*",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // Toggle edit mode without rewriting the document.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !readyRef.current) return;
    iframe.contentWindow?.postMessage(
      { type: editMode ? "__DE_ENABLE" : "__DE_DISABLE" },
      "*",
    );
  }, [editMode]);

  useImperativeHandle(ref, () => ({
    getEditedHtml: () =>
      new Promise<string>((resolve, reject) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return reject(new Error("iframe not ready"));
        const reqId = Math.random().toString(36).slice(2);
        const handler = (e: MessageEvent) => {
          const d: any = e.data;
          if (d && d.type === "__DE_HTML" && d.reqId === reqId) {
            window.removeEventListener("message", handler);
            resolve(d.html as string);
          }
        };
        window.addEventListener("message", handler);
        win.postMessage({ type: "__DE_GET", reqId }, "*");
        // Safety timeout
        setTimeout(() => {
          window.removeEventListener("message", handler);
          reject(new Error("timeout reading edited html"));
        }, 3000);
      }),
    undo: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "__DE_UNDO" }, "*");
    },
    redo: () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "__DE_REDO" }, "*");
    },
  }));

  return (
    <iframe
      ref={iframeRef}
      className="w-full h-full border-0 bg-white rounded-md"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      title="Design Editor"
    />
  );
});

DesignEditor.displayName = "DesignEditor";

export default DesignEditor;