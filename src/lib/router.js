import { useEffect, useState } from 'react'

const parse = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

export function useRoute() {
  const [parts, setParts] = useState(parse)
  useEffect(() => {
    const onChange = () => {
      setParts(parse())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parts
}

export const navigate = (path) => {
  window.location.hash = path
}

export const goBack = (fallback = '/') => {
  if (window.history.length > 1) window.history.back()
  else navigate(fallback)
}
