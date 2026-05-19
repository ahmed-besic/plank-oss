import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react'
import { ArrowRight, Boxes, Layers3, Sparkles } from 'lucide-react'
import { convexQuery } from '@convex-dev/react-query'
import { Button, Input, Surface } from '@plank/ui'
import { useState } from 'react'
import { api } from '@convex/_generated/api'
import { usePlankApp } from '../lib/providers'
import { useHydrated } from '../lib/use-hydrated'

 
const createRoute = createFileRoute as any

export const Route = createRoute('/')({ component: Home })

function Home() {
  const hydrated = useHydrated()
  const auth = useConvexAuth()
  const { convexClient, queryClient } = usePlankApp()
  const [memberName, setMemberName] = useState('')
  const [workspaceName, setWorkspaceName] = useState('My team workspace')
  const workspacesOptions = convexQuery(api.workspaces.listMine, {})
  const workspacesQuery = useQuery({
    ...workspacesOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const workspaces = workspacesQuery.data as
    | Array<{ id: string; name: string; slug: string; role: string }>
    | undefined
  const createWorkspace = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.workspaces.createWorkspace, {
        memberName,
        name: workspaceName,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspacesOptions.queryKey,
      })
    },
  })

  if (workspaces?.length) {
    const firstWorkspace = workspaces[0]
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12 lg:px-6">
        <Surface className="w-full p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lavender-bloom">
            Welcome back
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-grape-vine">
            Your workspace is ready.
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-violet">
            Jump back into {firstWorkspace.name} and keep the board moving.
          </p>
          <div className="mt-8">
            <Link
              params={{ workspaceSlug: firstWorkspace.slug }}
              search={{}}
              to="/w/$workspaceSlug"
            >
              <Button>
                Open workspace
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Surface>
      </div>
    )
  }

  if (auth.isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 lg:px-6">
        <Surface className="w-full p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lavender-bloom">
            First workspace
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-grape-vine">
            Create the workspace shell and start building from there.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-violet">
            The initial creation flow provisions a workspace, installs the
            sample plugin, creates the default board, and seeds the persisted
            board view registry.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Input
              aria-label="Your name"
              className="w-72"
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Your name"
              value={memberName}
            />
            <Input
              aria-label="Workspace name"
              className="w-80"
              onChange={(event) => setWorkspaceName(event.target.value)}
              value={workspaceName}
            />
            <Button
              disabled={!memberName.trim() || !workspaceName.trim()}
              onClick={() => createWorkspace.mutate()}
            >
              Create workspace
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-lavender-mist via-cloud-white to-ghost-gray/30">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 lg:px-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lavender-bloom">
              Plank
            </p>
            <p className="text-sm text-muted-violet">
              Open source workflow infrastructure for teams.
            </p>
          </div>
          <Link to="/login">
            <Button tone="ghost">Sign in</Button>
          </Link>
        </header>

        <main className="grid flex-1 gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-electric-violet">
              Team workflow, not teamware bloat
            </p>
            <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight text-grape-vine md:text-6xl">
              A real-time board core that grows through extensions.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-violet">
              Plank starts as a fast Kanban board and keeps the product honest:
              collaboration, structure, and extensibility before feature sprawl.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button>
                  Create account or sign in
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Authenticated>
                <Link to="/login">
                  <Button tone="ghost">Manage account</Button>
                </Link>
              </Authenticated>
            </div>
            <AuthLoading>
              <p className="mt-4 text-sm text-muted-violet">
                Connecting to Convex…
              </p>
            </AuthLoading>
            <Unauthenticated>
              <p className="mt-4 text-sm text-muted-violet">
                Local email and password auth is enabled. On a fresh Convex
                deployment, run `pnpm exec auth --web-server-url
                http://localhost:3000` once, or use the local port Vite reports.
              </p>
            </Unauthenticated>
          </section>

          <section className="grid gap-4">
            <Surface className="p-6">
              <div className="flex items-center gap-3">
                <Boxes className="h-5 w-5 text-electric-violet" />
                <h2 className="text-lg font-semibold text-grape-vine">
                  Board core
                </h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-violet">
                Shared work data, fast drag-and-drop, and flexible card detail
                bodies stay in core.
              </p>
            </Surface>
            <Surface className="p-6">
              <div className="flex items-center gap-3">
                <Layers3 className="h-5 w-5 text-info-blue" />
                <h2 className="text-lg font-semibold text-grape-vine">
                  Plugin seams
                </h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-violet">
                Alternate views, custom fields, commands, card slots, and
                reactive hooks ship as trusted local extensions.
              </p>
            </Surface>
            <Surface className="p-6">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-lavender-bloom" />
                <h2 className="text-lg font-semibold text-grape-vine">
                  Convex-backed
                </h2>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-violet">
                Realtime, auth, search, and optimistic UI come from one source
                of truth instead of infrastructure glue.
              </p>
            </Surface>
          </section>
        </main>
      </div>
    </div>
  )
}
