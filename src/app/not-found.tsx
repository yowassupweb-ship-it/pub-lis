export default function NotFound() {
  return (
    <main className="tavern-bg flex min-h-screen items-center justify-center p-4">
      <div className="parchment max-w-sm p-6 text-center">
        <p className="text-5xl">🗺️</p>
        <h1 className="mt-3 text-xl font-bold tavern-ink">Такой страницы в таверне нет</h1>
        <p className="mt-2 text-sm tavern-soft">
          Карта ведёт в пустоту — 404. Возможно, ссылка устарела или игра удалена.
        </p>
        <a href="/" className="btn-gold mt-5 w-full">К расписанию игр</a>
      </div>
    </main>
  );
}
