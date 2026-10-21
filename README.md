# rabeat
Comida a domicilio desde canarias.

Frontend (solo parte visual) hecho con **React 19 + Vite + Tailwind CSS 4**, pensado primero para móvil.

## Arrancar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

## Qué incluye

- **Inicio**: buscador (restaurantes y platos), categorías, filtro «Solo abiertos» y restaurantes separados en abiertos / cerrados según la hora real.
- **Restaurantes con horario**: 8 locales de Las Palmas con horarios distintos (24 h, solo desayunos, solo tardes, turnos partidos, cierre pasada la medianoche, día de descanso). Siempre hay alguno abierto y alguno cerrado.
- **Pedidos programados**: en los cerrados se puede pedir igualmente y elegir una franja de 30 min dentro de su horario (hoy y próximos días).
- **Menú**: cada plato con foto, título, descripción, precio, ración, kcal, tiempo de preparación, nº de pedidos, etiquetas (top ventas, vegano, picante…) y **alérgenos** (los 14 del Reglamento UE 1169/2011). Filtro para ocultar platos por alérgeno.
- **Cesta**: cantidades, notas por plato, pedido mínimo y aviso al mezclar restaurantes.
- **Pago**: dirección, entrega inmediata o programada, tarjeta / Bizum / Apple-Google Pay / efectivo, código promocional (`RABEAT10`, `CONEJO`) y **propina para el rider** (importes rápidos o personalizada).
- **Seguimiento**: estados del pedido simulados, mapa con el rider en camino, posibilidad de añadir más propina y valorar.

Los datos son de prueba (`src/data/restaurants.js`) y la cesta y los pedidos se guardan en `localStorage`.
