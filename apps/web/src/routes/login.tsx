import { useAuthActions } from '@convex-dev/auth/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { MoveRight } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { Button, Input, Surface } from '@plank/ui'

 
export const Route = (createFileRoute as any)('/login')({
  validateSearch: (search: any) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const auth = useConvexAuth()
  const { signIn } = useAuthActions()
  const search = Route.useSearch()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (auth.isAuthenticated) {
      if (search.redirect) {
        void navigate({
          to: search.redirect as never,
        })
        return
      }

      void navigate({ to: '/' })
    }
  }, [auth.isAuthenticated, navigate, search.redirect])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setState('submitting')
    setErrorMessage(null)

    try {
      const payload: Record<string, string> = {
        email,
        password,
        flow: mode,
      }
      if (mode === 'signUp' && name.trim()) {
        payload.name = name
      }
      await signIn('password', payload)
    } catch (error) {
      console.error(error)
      setState('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not continue',
      )
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl items-center px-4 py-8 lg:px-6">
      <div className="grid w-full gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Surface className="p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-text-tertiary">
            Convex auth
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-text-primary">
            Create an account or sign in.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-text-secondary">
            Plank uses Convex Auth with local email and password accounts. There
            is no external email service dependency. If this deployment is brand
            new, run{' '}
            <code className="rounded-md bg-surface-sunken px-1.5 py-0.5 text-sm text-electric-violet">
              pnpm exec auth --web-server-url http://localhost:3000
            </code>{' '}
            once, or use the actual local port Vite reports.
          </p>

          <div className="mt-8 flex gap-2">
            <Button
              onClick={() => setMode('signIn')}
              tone={mode === 'signIn' ? 'primary' : 'ghost'}
              type="button"
            >
              Sign in
            </Button>
            <Button
              onClick={() => setMode('signUp')}
              tone={mode === 'signUp' ? 'primary' : 'ghost'}
              type="button"
            >
              Create account
            </Button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            {mode === 'signUp' ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-text-primary">
                  Your name
                </span>
                <Input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Johnson"
                  value={name}
                />
              </label>
            ) : null}

            <label className="block space-y-2">
              <span className="text-sm font-medium text-text-primary">
                Email
              </span>
              <Input
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                type="email"
                value={email}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-text-primary">
                Password
              </span>
              <Input
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                type="password"
                value={password}
              />
            </label>

            <Button
              disabled={
                !email ||
                password.length < 8 ||
                state === 'submitting' ||
                (mode === 'signUp' && !name.trim())
              }
              type="submit"
            >
              <MoveRight className="mr-2 h-4 w-4" />
              {state === 'submitting'
                ? mode === 'signIn'
                  ? 'Signing in…'
                  : 'Creating account…'
                : mode === 'signIn'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>

            {state === 'error' && errorMessage ? (
              <p className="text-sm text-warning-orange">{errorMessage}</p>
            ) : null}
          </form>
        </Surface>

        <Surface className="flex flex-col justify-between bg-grape-vine p-8 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-lavender-bloom">
              First implementation milestone
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">
              Platform shell before feature sprawl.
            </h2>
            <p className="mt-4 text-sm leading-7 text-lavender-bloom/80">
              The initial build proves the extension runtime against real board
              data: custom views, fields, commands, slots, and normalized node
              events all hang off the same core workflow.
            </p>
          </div>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
            <p className="text-sm font-medium text-white">After sign-in</p>
            <p className="mt-2 text-sm text-lavender-bloom/80">
              Create a workspace, open the board, enable or disable the sample
              plugin, and use the command palette to add the confidence field.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-lavender-bloom">
              Workspace shell
              <MoveRight className="h-4 w-4" />
              Board core
              <MoveRight className="h-4 w-4" />
              Plugin surfaces
            </div>
          </div>
        </Surface>
      </div>
    </div>
  )
}
