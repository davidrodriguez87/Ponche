# Mi Ponche

App para ponchar entrada, almuerzo y salida, y calcular cuánto te deben pagar.

## Cómo publicarla en GitHub
1. Crea un repositorio nuevo (por ejemplo `mi-ponche`).
2. **Add file → Upload files** y sube TODO lo que hay dentro de esta carpeta (incluida la carpeta `icons`). El archivo `index.html` debe quedar en la raíz del repositorio.
3. **Settings → Pages →** Source: *Deploy from a branch*, Branch: `main`, carpeta `/ (root)` → **Save**.
4. En 1–2 minutos tu app estará en `https://TU-USUARIO.github.io/mi-ponche/`.

## Cómo ponerla en el iPhone
1. Abre ese enlace en **Safari**.
2. Toca **Compartir → Agregar a pantalla de inicio**.
3. Ábrela siempre desde el ícono.

## Cómo funciona el reloj
Cada ponche guarda la hora exacta del reloj del iPhone (que Apple sincroniza automáticamente). Aunque cierres la app por completo, al abrirla calcula el tiempo exacto desde tu ponche.
Para máxima precisión: **Ajustes del iPhone → General → Fecha y hora → Ajuste automático: activado**.

## Importante
- Tus datos se guardan solo en tu teléfono. Usa **Ajustes → Guardar copia de seguridad** de vez en cuando.
- El pago que calcula es **bruto** (antes de impuestos).
- Si actualizas la app, cambia `VERSION` en `sw.js`.
