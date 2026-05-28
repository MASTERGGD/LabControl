from .usuario import Usuario, RolUsuario
from .departamento import Departamento
from .laboratorio import Laboratorio, Computadora
from .horario import HorarioDisponible, Reservacion, SolicitudConflicto
from .sesion import SesionClase, AsignacionPC, ObservacionPC
from .inventario import Activo, Prestamo, Incidente, MantenimientoPreventivo
from .adeudo import Adeudo
from .notificacion import Notificacion
from .catalogo import CatalogoAlumno, CatalogoMateria, CatalogoCarrera
from .auditoria import AuditLog
from .cumplimiento import EventoCumplimiento
from .espacio import EspacioInstitucional, EspacioResponsable, EspacioApoyo, SolicitudEspacio, RequerimientoSolicitud
from .comunicado import (
    Comunicado, ComunicadoDestinatario, ComunicadoLectura, ComunicadoRespaldo,
    ComunicadoAdjunto, ComunicadoRespuesta, ComunicadoRespuestaAdjunto,
    ComunicadoRespuestaMensaje,
)
from .tutoria import (
    GrupoTutorado, AsignacionTutoria, PerfilSocioeconómico,
    SesionTutoria, RegistroSesionAlumno, Canalizacion,
    InformeBimestral, DocumentoControladoTutoria, ProgramacionSesionTutoria,
    HistorialEstadoTutoria, DetalleInformeBimestral, CierreTutoria,
)
from .consultorio import Paciente, ConsultaMedica, CanalizacionMedica
from .ficha_socioeconomica import FichaSocioeconomica, EstadoFicha
