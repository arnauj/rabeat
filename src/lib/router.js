import { useEffect, useState } from 'react'

const parse = () => {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) }
}

export function useRoute() {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => {
      setRoute(parse())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const navigate = (path) => {
  window.location.hash = path
}

export const goBack = (fallback = '/') => {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}
