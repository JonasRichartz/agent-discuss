import { useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/hooks/use-toast'
import type { DiscussionDetail } from '@/types'

/**
 * Custom hook that polls for discussion pause confirmation.
 *
 * After a pause request is sent, this hook polls the discussion status
 * at 500ms intervals until the status changes to 'paused' or the max
 * attempts (30) are reached.
 */
export function usePausePolling(discussionId: string | undefined) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const pauseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const startPolling = useCallback((onComplete: () => void) => {
    let attempts = 0
    const maxAttempts = 30

    pauseCheckIntervalRef.current = setInterval(async () => {
      attempts++
      await queryClient.refetchQueries({ queryKey: ['discussions', discussionId] })
      const result = queryClient.getQueryData<DiscussionDetail>(['discussions', discussionId])

      if (result?.status === 'paused') {
        clearInterval(pauseCheckIntervalRef.current!)
        onComplete()
        toast({ title: 'Discussion paused' })
      } else if (attempts >= maxAttempts) {
        clearInterval(pauseCheckIntervalRef.current!)
        onComplete()
        toast({
          title: 'Pause request sent',
          description: 'May take a moment to complete',
        })
      }
    }, 500)
  }, [discussionId, queryClient, toast])

  useEffect(() => {
    return () => {
      if (pauseCheckIntervalRef.current) {
        clearInterval(pauseCheckIntervalRef.current)
      }
    }
  }, [])

  return { startPolling }
}
