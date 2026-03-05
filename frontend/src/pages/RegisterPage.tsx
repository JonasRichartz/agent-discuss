import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { RegisterForm } from '@/components/auth/RegisterForm'

export default function RegisterPage() {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background p-4 overflow-hidden">
      {/* Animated gradient background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -20%, hsl(var(--primary) / 0.04), transparent),' +
            'radial-gradient(ellipse 60% 50% at 80% 50%, hsl(var(--primary) / 0.03), transparent),' +
            'radial-gradient(ellipse 60% 50% at 20% 80%, hsl(var(--primary) / 0.02), transparent)',
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015] dark:opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),' +
            'linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative z-10 w-full max-w-md space-y-8 animate-slide-up">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Multi-LLM Project</h1>
          <p className="text-muted-foreground text-sm tracking-wide">
            Multi-agent discussion platform
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  )
}
