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
}

interface Props {
  html: string;
  editMode: boolean;
}

const EDITOR_SCRIPT = `
(function(){
  if (window.__deInstalled) return; window.__deInstalled = true;

  var STYLE = ''+
    '[data-de-block]{transition:outline-color .1s;}'+
    '[data-de-block]:hover{outline:2px dashed rgba(99,102,241,.6);outline-offset:2px;cursor:grab;}'+
    '[data-de-text]:hover{outline:2px dashed rgba(16,185,129,.6);outline-offset:2px;cursor:text;}'+
    '[data-de-text]:focus{outline:2px solid #10b981;outline-offset:2px;cursor:text;}'+
    '[data-de-dragging]{opacity:.4;}'+
    '[data-de-drop-before]{box-shadow:inset 0 4px 0 0 #6366f1!important;}'+
    '[data-de-drop-after]{box-shadow:inset 0 -4px 0 0 #6366f1!important;}';

  var styleEl = document.createElement('style');
  styleEl.id = '__de_style';
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  var SKIP = {SCRIPT:1,STYLE:1,HTML:1,HEAD:1,META:1,LINK:1,BODY:1,NOSCRIPT:1,TITLE:1};
  var TEXT_TAGS = {H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,P:1,LI:1,A:1,BUTTON:1,SPAN:1,STRONG:1,EM:1,SMALL:1,BLOCKQUOTE:1,TD:1,TH:1,LABEL:1,FIGCAPTION:1};

  var enabled = false;
  var dragSrc = null;

  function isLeafTextEl(el){
    if (!TEXT_TAGS[el.tagName]) return false;
    // leaf-ish: no child element nodes
    for (var i=0;i<el.childNodes.length;i++){
      if (el.childNodes[i].nodeType === 1) return false;
    }
    return true;
  }

  function enable(){
    if (enabled) return; enabled = true;
    var all = document.body.querySelectorAll('*');
    for (var i=0;i<all.length;i++){
      var el = all[i];
      if (SKIP[el.tagName]) continue;
      if (isLeafTextEl(el)){
        el.setAttribute('contenteditable','true');
        el.setAttribute('data-de-text','1');
        el.setAttribute('spellcheck','true');
      }
      // Mark as a draggable block (any element). Drag only fires sibling moves.
      el.setAttribute('draggable','true');
      el.setAttribute('data-de-block','1');
    }
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('paste', onPaste, true);
    // Prevent navigation when clicking edited anchors.
    document.addEventListener('click', onClick, true);
  }

  function disable(){
    if (!enabled) return; enabled = false;
    document.querySelectorAll('[data-de-block]').forEach(function(el){
      el.removeAttribute('draggable');
      el.removeAttribute('data-de-block');
      el.removeAttribute('data-de-dragging');
      el.removeAttribute('data-de-drop-before');
      el.removeAttribute('data-de-drop-after');
    });
    document.querySelectorAll('[data-de-text]').forEach(function(el){
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-de-text');
      el.removeAttribute('spellcheck');
    });
    document.removeEventListener('dragstart', onDragStart, true);
    document.removeEventListener('dragover', onDragOver, true);
    document.removeEventListener('dragleave', onDragLeave, true);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('dragend', onDragEnd, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('click', onClick, true);
  }

  function onClick(e){
    if (!enabled) return;
    var a = e.target && e.target.closest && e.target.closest('a');
    if (a) { e.preventDefault(); }
  }

  function onKeyDown(e){
    if (!enabled) return;
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
    t.setAttribute('data-de-dragging','1');
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain','de'); } catch(_){}
    e.stopPropagation();
  }

  function onDragOver(e){
    if (!enabled || !dragSrc) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (!t || t === dragSrc) return;
    // STRICT: must be a direct sibling (same parent).
    if (t.parentElement !== dragSrc.parentElement) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch(_){}
    clearMarkers();
    var r = t.getBoundingClientRect();
    var before = (e.clientY - r.top) < r.height / 2;
    t.setAttribute(before ? 'data-de-drop-before' : 'data-de-drop-after','1');
    e.stopPropagation();
  }

  function onDragLeave(e){
    if (!enabled) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (t){ t.removeAttribute('data-de-drop-before'); t.removeAttribute('data-de-drop-after'); }
  }

  function onDrop(e){
    if (!enabled || !dragSrc) return;
    var t = e.target && e.target.closest && e.target.closest('[data-de-block]');
    if (!t || t === dragSrc) return;
    if (t.parentElement !== dragSrc.parentElement) return;
    e.preventDefault();
    var r = t.getBoundingClientRect();
    var before = (e.clientY - r.top) < r.height / 2;
    if (before) t.parentElement.insertBefore(dragSrc, t);
    else t.parentElement.insertBefore(dragSrc, t.nextSibling);
    clearMarkers();
    e.stopPropagation();
  }

  function onDragEnd(){
    if (dragSrc) dragSrc.removeAttribute('data-de-dragging');
    dragSrc = null;
    clearMarkers();
  }

  function clearMarkers(){
    document.querySelectorAll('[data-de-drop-before],[data-de-drop-after]').forEach(function(el){
      el.removeAttribute('data-de-drop-before');
      el.removeAttribute('data-de-drop-after');
    });
  }

  function getCleanHtml(){
    var was = enabled;
    if (was) disable();
    var html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
    // Strip our injected style tag regardless.
    html = html.replace(/<style[^>]*id="__de_style"[\\s\\S]*?<\\/style>/i, '');
    if (was) enable();
    return html;
  }

  window.addEventListener('message', function(ev){
    var d = ev.data || {};
    if (d.type === '__DE_ENABLE') enable();
    else if (d.type === '__DE_DISABLE') disable();
    else if (d.type === '__DE_GET') {
      var html = getCleanHtml();
      try { parent.postMessage({type:'__DE_HTML', reqId:d.reqId, html:html}, '*'); } catch(_){}
    }
  });

  try { parent.postMessage({type:'__DE_READY'}, '*'); } catch(_){}
})();
`;

const DesignEditor = forwardRef<DesignEditorHandle, Props>(({ html, editMode }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

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