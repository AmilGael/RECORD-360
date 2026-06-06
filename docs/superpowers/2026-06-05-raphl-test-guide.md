# Raphl — Test Guide (what to test from the architect feedback)

**App:** https://satisfied-semiconductor-deposit-prototype.trycloudflare.com (temporary tunnel) — or http://localhost:3000
**Logins** (company "Constructora Demo SRL"):
- `admin@record360.do` / `demo1234` (Admin)
- `manager@record360.do` / `test1234` (Gerente)
- `supervisor@record360.do` / `test1234` (Supervisor)
- `resident@record360.do` / `test1234` (Residente)

Tip: some things differ by role — log in as **resident** to test scoped access, as **manager** to approve Cambios.

---

## ✅ Done — test each of these

### Captura / notas (Cuaderno)
1. **Subir fotos / PDF / audio / video** — open a Partida → in the composer attach a photo **>1 MB** and a **PDF** → both upload and show (photo as image, PDF as "Ver documento"). Video/audio also accepted (video up to 50 MB for now).
2. **GPS automático** — the composer shows "GPS OK" captured on its own, no button to press (allow location).
3. **No se borra lo escrito al fallar** — type a note, force an error (e.g. attach a file >50 MB) → an inline error appears and **your text stays**.
4. **Nombre del autor en la nota** — every Cuaderno entry shows "por <nombre>".
5. **"Abrir Cuaderno completo"** — the partida summary link says Cuaderno (not Bitácora).
6. **Responder a una nota (estilo WhatsApp)** — on an existing entry use "Responder" → your reply links to the original.
7. **Recordatorios** — when logging, set a reminder date; the Bloque "Recordatorios" space lists pending/overdue ones with **"Marcar resuelto"**; "Indicadores" shows overdue + no-reminder counts.

### Estructura de obra
8. **"Bloque" en vez de "Segmento"** — the tree says Bloque / Sin bloque / + Bloque.
9. **Pestañas Partidas / Planos / Cambios / Analítica** — separate tabs; Partidas = work items, Planos = uploaded plans.
10. **Subir planos por fecha** — Planos tab: upload a plan (PDF/image) → listed newest-first with uploader + "Ver plano". Also per-Bloque in the spaces panel.
11. **Editar nombres** — rename the Obra (header), a Bloque, and a Partida (pencil controls; admin/manager/assigned).
12. **Mover partidas entre bloques** — use the move control on a partida → send it to another Bloque or "Sin bloque".
13. **Buscar partidas + filtrar por bloque** — the search box filters partidas by name; the bloque dropdown filters; empty search shows a "no results" message.
14. **Borrar partidas + Reciclaje** — delete a Partida (admin/manager) → it leaves the tree → "Reciclaje" shows it with "borrado por <nombre> · fecha" → **Restaurar**; for an empty partida, **Borrar definitivamente** (one with entries shows "Contiene registros").

### Avance
15. **% de avance en la partida (manual)** — edit a Partida's progress directly on its summary (not inside notes).
16. **Cálculo de abajo hacia arriba** — change a partida's %, then check the Bloque % and the project % update as proportional totals.

### Equipo / accesos
17. **Ver supervisor y residente por proyecto** — the "Equipo asignado" panel shows them; admins can assign/remove.
18. **Residente solo ve su proyecto** — as `resident`, you only see assigned projects (not the whole company). Same for supervisor.
19. **Residente puede gestionar partidas** — as an assigned resident, you can add/rename/move/delete partidas on your project.

### Cambios (órdenes de cambio)
20. **Solicitud por Bloques** — Cambios tab → "Nueva solicitud": multiselect of **Bloques afectados** (no Costo/Tiempo fields anymore).
21. **Aprobar / Rechazar (gerente)** — as `manager`, open a request → **Integrar** (fans out note-style entries to the partidas in those bloques) or **Rechazar** (requires a **motivo de rechazo**). You can't resolve your own request.

### Etiquetas
22. **Etiquetas de partida** — tag a partida by type (e.g. Mampostería) including custom tags; group/filter by them.

### Espacios por Bloque
23. **Espacios** — inside the Partidas tab, the per-Bloque panel has **Cuaderno · Planos · Planos actualizados · Levantamientos · Ideas · Media · Recordatorios · Indicadores**.
24. **Media agrupada** — the Media space groups attachments by Imagen / Video / Audio / PDF.

### Analítica e integridad
25. **Tablero semáforo (Analítica)** — Analítica tab: Rojo/Amarillo/Verde health at project, per-Bloque, and per-Partida, plus open-Cambios and overdue-reminder counts.
26. **Verificar integridad** — on a Partida, press **"Verificar integridad"** → confirms the immutable chain (Sello) is intact ("Cadena íntegra").

### Administración
27. **Restablecer contraseña** — as `admin`, on the Equipo screen each member has **"Restablecer contraseña"** → shows a new temporary password once.

---

## ⏳ Not done yet (don't expect these)
- Active push/email **notifications** (only in-app counts exist).
- Media submenus split out **"notas de voz" / "minutas"** as their own categories (currently grouped by file type).
- A full **location breadcrumb** bar (the per-Bloque spaces panel is there).
- **Permanent delete of projects** (only archive/restore).
- **Large video > 50 MB**, **PDF report export**, **voice→text transcription**, **offline/PWA**, **legally-binding digital signatures**, feed **pagination**.
