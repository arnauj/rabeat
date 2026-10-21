// Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011)
export const ALLERGENS = {
  gluten: { name: 'Gluten', icon: '🌾' },
  crustaceos: { name: 'Crustáceos', icon: '🦐' },
  huevo: { name: 'Huevo', icon: '🥚' },
  pescado: { name: 'Pescado', icon: '🐟' },
  cacahuete: { name: 'Cacahuete', icon: '🥜' },
  soja: { name: 'Soja', icon: '🫘' },
  lacteos: { name: 'Lácteos', icon: '🥛' },
  frutos_cascara: { name: 'Frutos de cáscara', icon: '🌰' },
  apio: { name: 'Apio', icon: '🥬' },
  mostaza: { name: 'Mostaza', icon: '🌭' },
  sesamo: { name: 'Sésamo', icon: '⚪' },
  sulfitos: { name: 'Sulfitos', icon: '🍷' },
  altramuces: { name: 'Altramuces', icon: '🌼' },
  moluscos: { name: 'Moluscos', icon: '🦑' },
}

export const ALLERGEN_KEYS = Object.keys(ALLERGENS)
