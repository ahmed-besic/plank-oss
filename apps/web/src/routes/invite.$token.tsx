import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react'
import { useEffect } from 'react'
import { Button, Surface } from '@plank/ui'
import { api } from '@convex/_generated/api'
import { usePlankApp } from '../lib/providers'

 
const createRoute = createFileRoute as any

export const Route = createRoute('/invite/$token')({
  component: InviteRoute,
})

function InviteRoute() {
  const { token } = Route.useParams()
  const navigate = useNavigate()
  const auth = useConvexAuth()
  const { convexClient } = usePlankApp()
  const acceptInvite = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.workspaces.acceptInvite, {
        token,
      }),
    onSuccess: async (result) => {
      if (result.workspaceSlug) {
        await navigate({
          params: {
            workspaceSlug: result.workspaceSlug,
          },
          search: {},
          to: '/w/$workspaceSlug',
        } as never)
      }
    },
  })

  useEffect(() => {
    if (!auth.isAuthenticated || acceptInvite.isPending || acceptInvite.isSuccess) {
      return
    }

    acceptInvite.mutate()
  }, [acceptInvite, auth.isAuthenticated])

  return (
    <>
      <AuthLoading>
        <div className="p-8 text-muted-violet">Checking invite…</div>
      </AuthLoading>
      <Unauthenticated>
        <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 lg:px-6">
          <Surface className="w-full p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lavender-bloom">
              Invite
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-grape-vine">
              Sign in to accept this workspace invite.
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-violet">
              Once you sign in, Plank will attach this invite token to your session and
              take you straight into the workspace.
            </p>
            <div className="mt-6">
              <Link
                search={{ redirect: `/invite/${token}` }}
                to="/login"
              >
                <Button>Sign in to continue</Button>
              </Link>
            </div>
          </Surface>
        </div>
      </Unauthenticated>
      <Authenticated>
        <div className="mx-auto flex min-h-screen max-w-3xl items-center px-4 py-8 lg:px-6">
          <Surface className="w-full p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lavender-bloom">
              Invite
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-grape-vine">
              {acceptInvite.isError
                ? 'This invite could not be accepted.'
                : 'Joining workspace…'}
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-violet">
              {acceptInvite.isError
                ? acceptInvite.error instanceof Error
                  ? acceptInvite.error.message
                  : 'The invite token is invalid or expired.'
                : 'Plank is validating the invite and adding you to the workspace.'}
            </p>
            {acceptInvite.isError ? (
              <div className="mt-6">
                <Button onClick={() => acceptInvite.mutate()} tone="ghost">
                  Try again
                </Button>
              </div>
            ) : null}
          </Surface>
        </div>
      </Authenticated>
    </>
  )
}
