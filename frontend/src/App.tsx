import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { lazy, Suspense, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

import DashboardPage from '@/pages/DashboardPage'

const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const EditDiscussionPage = lazy(() => import('@/pages/EditDiscussionPage').then(m => ({ default: m.EditDiscussionPage })))

import { AuthGuard } from '@/components/auth/AuthGuard'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Toaster } from '@/components/ui/toaster'

function App() {
  const { setUser, setSession, setLoading } = useAuthStore()

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [setUser, setSession, setLoading])

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Suspense fallback={<div>Loading...</div>}><LoginPage /></Suspense>} />
        <Route path="/register" element={<Suspense fallback={<div>Loading...</div>}><RegisterPage /></Suspense>} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/discussion/:id"
          element={
            <AuthGuard>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/discussion/:id/edit"
          element={
            <AuthGuard>
              <Suspense fallback={<div>Loading...</div>}><EditDiscussionPage /></Suspense>
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard>
              <Suspense fallback={<div>Loading...</div>}><SettingsPage /></Suspense>
            </AuthGuard>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </ErrorBoundary>
  )
}

export default App
