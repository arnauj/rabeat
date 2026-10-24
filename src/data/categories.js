export const CATEGORIES = [
  { id: 'all', label: 'Todo', icon: '🍽️' },
  { id: 'canaria', label: 'Canaria', icon: '🥔' },
  { id: 'burger', label: 'Burgers', icon: '🍔' },
  { id: 'sushi', label: 'Sushi', icon: '🍣' },
  { id: 'pizza', label: 'Pizza', icon: '🍕' },
  { id: 'mexicana', label: 'Mexicana', icon: '🌮' },
  { id: 'healthy', label: 'Healthy', icon: '🥗' },
  { id: 'desayuno', label: 'Desayunos', icon: '🥐' },
  { id: 'postres', label: 'Postres', icon: '🍰' },
  { id: 'otros', label: 'Otros', icon: '✨' },
]

export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id

export const DISH_TAGS = [
  { id: 'vegano', label: '🌱 Vegano', cls: 'bg-emerald-50 text-emerald-700' },
  { id: 'vegetariano', label: '🥕 Veggie', cls: 'bg-emerald-50 text-emerald-700' },
  { id: 'picante', label: '🌶️ Picante', cls: 'bg-orange-50 text-orange-700' },
  { id: 'sin_gluten', label: '🌾 Sin gluten', cls: 'bg-amber-50 text-amber-800' },
  { id: 'nuevo', label: '✨ Nuevo', cls: 'bg-sky-50 text-sky-700' },
]
