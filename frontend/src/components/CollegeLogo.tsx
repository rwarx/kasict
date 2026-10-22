// Фирменный знак колледжа (УК) — вектор, обводка повторяет оригинальный логотип.
// Цвет берётся из currentColor: в шапке — var(--accent) (сезонный или фиолетовый),
// поэтому знак автоматически адаптируется под любую тему без отдельных файлов.

export function CollegeLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1393 908"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Внешний контур + треугольный вырез (fill-rule evenodd) */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0 0H472.5V438.5L910.5 0H1372L925 438L1393 908H473V440.5A473 473 0 0 1 0 908ZM478 438.5H921.5L919.5 878Z"
      />
    </svg>
  )
}
