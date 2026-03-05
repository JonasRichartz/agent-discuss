import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeSetting = 'light' | 'dark' | 'system'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: 'light' | 'dark') {
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

interface UIState {
  theme: ThemeSetting
  graphPanelOpen: boolean

  setTheme: (theme: ThemeSetting) => void
  toggleTheme: () => void
  setGraphPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      graphPanelOpen: false,

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme === 'system' ? getSystemTheme() : theme)
      },

      toggleTheme: () => {
        const current = get().theme
        const resolved = current === 'system' ? getSystemTheme() : current
        get().setTheme(resolved === 'dark' ? 'light' : 'dark')
      },

      setGraphPanelOpen: (graphPanelOpen) => set({ graphPanelOpen }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        const setting = state?.theme ?? 'system'
        applyTheme(setting === 'system' ? getSystemTheme() : setting)
      },
    }
  )
)

// Listen for OS theme changes when set to 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useUIStore.getState().theme === 'system') {
    applyTheme(getSystemTheme())
  }
})
