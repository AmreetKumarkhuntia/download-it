import { createContext, useContext } from 'react';
import type { useWorkspaceController } from './use-workspace-controller';

export const WorkspaceContext = createContext<ReturnType<typeof useWorkspaceController> | null>(
  null,
);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Widgets must be rendered inside WorkspaceWidget.');
  return value;
}
