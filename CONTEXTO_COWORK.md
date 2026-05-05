# LabControl UTECAN — Contexto para Cowork / Claude

## ¿Qué es este proyecto?
Plataforma web multi-laboratorio para la Universidad Tecnológica de Candelaria (UTECAN),
Candelaria, Campeche, México. Gestiona 4 laboratorios de cómputo con control de horarios,
sesiones de clase, inventario de equipos, préstamos y reportes institucionales.

## Responsable del proyecto
Mtro. Gilberto García Delgado (Profe Gil) — docente y asesor técnico de UTECAN.
Conoce Python, FastAPI, n8n, Docker, Telegram bots, SQL Server, VirtualBox.

## Roles del sistema
- SUPER_ADMIN → control total institucional, asigna responsables de lab
- LAB_ADMIN   → controla su laboratorio (horarios, inventario, préstamos, reportes)
- DOCENTE     → reserva laboratorios, gestiona sesiones, asigna PCs a alumnos
- ALUMNO      → ve su asignación activa (fase futura)

## Funcionalidades a desarrollar (por orden de prioridad)
1. Auth: login con JWT, protección por roles
2. Gestión de laboratorios y computadoras (CRUD por súper admin)
3. Horarios del cuatrimestre por laboratorio
4. Reservaciones de docentes con vista de disponibilidad
5. Sesión de clase: abrir, asignar PCs con buscador en tiempo real, cerrar
6. Mapa visual de PCs con WebSockets (verde=libre, rojo=ocupada, azul=en clase)
7. Inventario de equipos (PCs, impresoras 3D, brazos robóticos, scanners, IoT)
8. Préstamos con estados y alertas
9. Carga masiva de alumnos/docentes por Excel
10. Solicitud de laboratorio alternativo entre labs
11. Reportes automáticos con n8n + Telegram

## Stack tecnológico
- Backend:  FastAPI (Python 3.11) + SQLAlchemy + SQLite
- Frontend: React + Tailwind CSS (sin frameworks CSS externos)
- Auth:     JWT con roles
- Realtime: WebSockets nativos FastAPI
- Extras:   n8n + Telegram Bot para notificaciones
- Deploy:   Docker + docker-compose
- Acceso:   Cloudflare Tunnel (Starlink/CGNAT en UTECAN)

## Infraestructura actual
- Servidor: PC de escritorio en el laboratorio (Windows)
- Internet: Starlink con IP dinámica y CGNAT
- Solución acceso externo: Cloudflare Tunnel (gratis)
- Migración futura: VPS Hostinger ~$5/mes (mismo docker-compose, solo cambia .env)

## Decisiones de diseño ya tomadas
- SQLAlchemy ORM: permite cambiar SQLite → PostgreSQL solo cambiando DATABASE_URL en .env
- Docker desde el inicio: migración a VPS = copiar carpeta + docker-compose up
- Alumnos NO tienen login en fase 1: el docente escribe nombre/matrícula al asignar PC
- Carga masiva por Excel al inicio de cada cuatrimestre
- n8n maneja automatizaciones (ya conocido y funcionando en UTECAN)
- Cloudflare Tunnel resuelve el problema de Starlink/CGNAT sin costo

## Estructura del proyecto
labcontrol/
├── backend/
│   ├── models/        → usuario, laboratorio, horario, sesion, inventario
│   ├── routers/       → auth, laboratorios, horarios, sesiones, inventario, prestamos
│   ├── websockets/    → mapa en tiempo real
│   ├── database.py    → conexión SQLAlchemy
│   ├── main.py        → app FastAPI
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/     → Login, Dashboard, Horarios, SesionClase, Inventario, Prestamos
│       ├── components/→ PCMap, BuscadorAlumno, CalendarioGlobal, ObservacionCierre
│       ├── hooks/     → useApi.js, useWebSocket.js
│       └── context/   → AuthContext.jsx
├── n8n/               → workflows JSON
├── data/              → SQLite DB (gitignored)
├── docker-compose.yml
└── .env.example

## Contexto adicional del proyecto MotoWatch (referencia)
Profe Gil asesora el proyecto MotoWatch (visión computacional con YOLO, FastAPI,
Jetson Nano) para ExpoCiencias Campeche 2026. Ese proyecto usa arquitectura similar
(FastAPI + SQLite + React) así que hay experiencia previa en el equipo.

## Lo que sigue (próximo paso de desarrollo)
Implementar módulo de autenticación:
- POST /auth/login → devuelve JWT
- GET /auth/me → usuario actual
- Middleware de roles para proteger rutas
- Página de Login en React con redirección por rol
