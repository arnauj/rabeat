import { useCallback, useEffect, useRef, useState } from 'react'

// Carga asíncrona sencilla con recarga manual
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const latest = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(
    async (silent = false) => {
      const id = ++latest.current
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
      try {
        const data = await run()
        if (id === latest.current) setState({ data, error: null, loading: false })
      } catch (error) {
        if (id === latest.current) setState((s) => ({ ...s, error, loading: false }))
      }
    },
    [run],
  )

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload }
}
