import { createContext, useContext } from 'react'

interface GraphEditorContextValue {
  discussionId?: string
}

const GraphEditorContext = createContext<GraphEditorContextValue>({})

export const GraphEditorProvider = GraphEditorContext.Provider

export function useGraphEditorContext() {
  return useContext(GraphEditorContext)
}
