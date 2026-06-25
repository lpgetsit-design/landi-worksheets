import { useQuery } from "@tanstack/react-query";
import { listFolders, buildFolderTree } from "@/lib/space";

export const useSpaceTree = () => {
  const query = useQuery({
    queryKey: ["space_folders"],
    queryFn: listFolders,
  });
  const folders = query.data ?? [];
  const tree = buildFolderTree(folders);
  return { ...query, folders, tree };
};