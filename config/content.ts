export type ProgramType = "Conferencia" | "Taller" | "Concurso" | "Actividad";
export type ProgramItem = {
  id: number;
  date?: string;
  time: string;
  day: string;
  type: ProgramType;
  title: string;
  description: string;
  person: string;
  place: string;
  capacity?: string;
  status?: "Provisional" | "Confirmado";
};

export const content = {
  event: { date: "20 al 23 de Octubre 2026 ", venue: "CUCEI · Universidad de Guadalajara" },
  hero: {
    description: "Un espacio para descubrir cómo evoluciona la química, cómo se transforma la profesión y qué caminos pueden construir las nuevas generaciones.",
  },
  overview: {
    intro:
      "El Evento del Químico 2026 será un espacio para reflexionar sobre cómo evolucionan la formación y el ejercicio profesional de la química. Conferencias, paneles, foros, talleres y actividades estudiantiles reunirán conocimientos, experiencias y retos que hoy forman parte del desarrollo de quienes construyen el futuro de la química.",
    highlights: [
      {
        title: "Conversaciones que inspiran",
        description:
          "Conferencias, paneles y foros para conocer ideas, experiencias y perspectivas de la profesión.",
        label: "Conferencias · paneles · foros",
      },
      {
        title: "Química en acción",
        description:
          "Talleres y experiencias prácticas para explorar herramientas, procesos y áreas de aplicación.",
        label: "Talleres · experiencias",
      },
      {
        title: "Talento y comunidad",
        description:
          "Concursos y actividades estudiantiles para compartir proyectos, creatividad y colaboración.",
        label: "Concursos · comunidad",
      },
      {
        title: "Trayectorias y futuro",
        description:
          "Encuentros para descubrir caminos en la investigación, la industria y el desarrollo profesional.",
        label: "Profesión · investigación · industria",
      },
    ],
  },
  program: [
    { id: 1, time: "10:00", day: "Día 1", type: "Conferencia", title: "Química para un mundo en transición", description: "Panorama de los retos científicos y profesionales que conectan la química con nuevas formas de aprender y resolver problemas.", person: "Ponente por confirmar", place: "Auditorio por confirmar" },
    { id: 2, time: "12:30", day: "Día 1", type: "Taller", title: "Laboratorio de competencias integradas", description: "Experiencia práctica para integrar fundamentos, comunicación científica, colaboración y toma de decisiones.", person: "Facilitador/a por confirmar", place: "Laboratorio por confirmar", capacity: "Cupo por definir" },
    { id: 3, time: "09:30", day: "Día 2", type: "Conferencia", title: "Del conocimiento a la competencia profesional", description: "Conversación sobre el modelo mixto basado en competencias y su relación con los escenarios reales de la profesión.", person: "Ponente por confirmar", place: "Auditorio por confirmar" },
    { id: 4, time: "13:00", day: "Día 2", type: "Concurso", title: "Reto de innovación química", description: "Equipos multidisciplinarios proponen soluciones químicas a un desafío del entorno.", person: "Bases por publicar", place: "Sede por confirmar", capacity: "Registro próximo" },
    { id: 5, time: "11:00", day: "Día 3", type: "Taller", title: "Datos, evidencia y comunicación científica", description: "Del dato a una conclusión clara: herramientas para analizar, argumentar y comunicar con rigor.", person: "Facilitador/a por confirmar", place: "Sala por confirmar", capacity: "Cupo por definir" },
    { id: 6, time: "12:00", day: "Día 4", type: "Actividad", title: "Encuentro de comunidad química", description: "Cierre cultural y espacio para compartir proyectos, aprendizajes y nuevas conexiones.", person: "Comunidad CUCEI", place: "Explanada por confirmar" },
  ] satisfies ProgramItem[],
  activities: [
    { anchor: "conferencias", kicker: "Escucha · pregunta · conecta", title: "Conferencias", description: "Ideas y conversaciones con voces de la ciencia y la profesión." },
    { anchor: "talleres", kicker: "Experimenta · construye · aplica", title: "Talleres", description: "Sesiones prácticas para activar conocimientos y desarrollar habilidades." },
    { anchor: "concursos", kicker: "Imagina · resuelve · comparte", title: "Concursos", description: "Retos para poner a prueba el ingenio, la colaboración y la comunicación." },
  ],
  partners: [
    { role: "Institución", initials: "UDG", name: "Universidad de Guadalajara", provisional: false },
    { role: "Sede", initials: "CUCEI", name: "Centro Universitario de Ciencias Exactas e Ingenierías", provisional: false },
    { role: "Patrocinador", initials: "+", name: "Aliado por confirmar", provisional: true },
    { role: "Colaborador", initials: "+", name: "Aliado por confirmar", provisional: true },
  ],
  info: [
    { label: "Organiza", value: "Coordinación de la Licenciatura en Química" },
    { label: "Sede", value: "CUCEI · Módulo E" },
    { label: "Dirección", value: "Blvd. Gral. Marcelino García Barragán 1421, Guadalajara, Jalisco" },
    { label: "Telegram", value: "@QuimicosUDG", href: "https://t.me/QuimicosUDG" },
    { label: "Teléfono", value: "+52 (33) 33 1378 5900 ext. 27532", href: "tel:+523313785900" },
  ],
} as const;
