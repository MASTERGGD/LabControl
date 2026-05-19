from .usuario import Usuario, RolUsuario
from .departamento import Departamento
from .laboratorio import Laboratorio, Computadora
from .horario import HorarioDisponible, Reservacion, SolicitudConflicto
from .sesion import SesionClase, AsignacionPC, ObservacionPC
from .inventario import Activo, Prestamo, Incidente, MantenimientoPreventivo
from .notificacion import Notificacion
from .catalogo import CatalogoAlumno, CatalogoMateria
from .auditoria import AuditLog
from .cumplimiento import EventoCumplimiento
from .espacio import EspacioInstitucional, EspacioResponsable, SolicitudEspacio, RequerimientoSolicitud
from .comunicado import Comunicado, ComunicadoDestinatario, ComunicadoLectura
