import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Moon, Sun, LogOut } from 'lucide-react'

export function Header() {
  const { user } = useAuthStore()
  const { theme, toggleTheme } = useUIStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      navigate('/login')
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Logout failed',
        description: 'An error occurred while logging out',
      })
    }
  }

  return (
    <header className="flex items-center justify-between px-6 h-14 bg-background/80 backdrop-blur-sm shadow-soft">
      <div className="flex items-center gap-4">
        {/* Breadcrumb or title could go here */}
      </div>

      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {/* Divider */}
        <div className="h-4 w-px bg-border mx-2" />

        {/* User Info */}
        <span className="text-sm text-muted-foreground">
          {user?.email}
        </span>

        {/* Divider */}
        <div className="h-4 w-px bg-border mx-2" />

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground hover:text-foreground text-xs gap-1.5"
          onClick={handleLogout}
          title="Logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Log out</span>
        </Button>
      </div>
    </header>
  )
}
