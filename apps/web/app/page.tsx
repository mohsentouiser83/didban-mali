const foundations = [
  { number: "۰۱", label: "رابط کاربری", value: "Next.js 16", state: "آماده" },
  { number: "۰۲", label: "هسته API", value: "FastAPI", state: "آماده" },
  { number: "۰۳", label: "پردازش پس‌زمینه", value: "Celery + Redis", state: "آماده" },
  { number: "۰۴", label: "داده و فایل", value: "PostgreSQL + MinIO", state: "آماده" },
] as const;

const principles = ["صحت پیش از هوش مصنوعی", "شواهد پیش از ادعا", "انسان در حلقه تصمیم"];

function Mark() {
  return (
    <div className="mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function Home() {
  return (
    <main>
      <nav className="nav" aria-label="ناوبری اصلی">
        <a className="brand" href="#top" aria-label="دیدبان مالی، صفحه اصلی">
          <Mark />
          <span>دیدبان مالی</span>
        </a>
        <span className="phase-badge">فاز ۱ · زیرساخت</span>
      </nav>

      <section className="hero" id="top">
        <div className="eyebrow">
          <span className="pulse" />
          پایه فنی سامانه فعال است
        </div>
        <h1>
          از داده مالی خام
          <br />
          تا <em>تصمیم قابل اعتماد</em>
        </h1>
        <p className="lede">
          دیدبان مالی روی سیستم حسابداری شما می‌نشیند و داده‌ها را به کنترل، تحلیل و یافته‌های
          شواهدمحور تبدیل می‌کند؛ بدون دست‌کاری دفاتر مالی.
        </p>

        <div className="principles" aria-label="اصول محصول">
          {principles.map((principle) => (
            <span key={principle}>{principle}</span>
          ))}
        </div>
      </section>

      <section className="status-section" aria-labelledby="status-heading">
        <div className="section-heading">
          <div>
            <span>وضعیت فاز جاری</span>
            <h2 id="status-heading">زیرساخت توسعه</h2>
          </div>
          <p>اجزای پایه برای شروع امن ماژول‌های دامنه آماده شده‌اند.</p>
        </div>

        <div className="foundation-grid">
          {foundations.map((item) => (
            <article className="foundation-card" key={item.label}>
              <span className="card-index">{item.number}</span>
              <div>
                <p>{item.label}</p>
                <strong dir="ltr">{item.value}</strong>
              </div>
              <span className="state">
                <i />
                {item.state}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="next-step" aria-labelledby="next-heading">
        <span className="next-number">۰۲</span>
        <div>
          <p>گام بعد پس از تأیید</p>
          <h2 id="next-heading">هویت، نقش‌ها و مدیریت شرکت‌ها</h2>
        </div>
        <span className="locked">در انتظار دروازه فاز ۱</span>
      </section>

      <footer>
        <span>دیدبان مالی · نسخه ۰٫۱</span>
        <span>ساخته‌شده برای تیم‌های مالی ایران</span>
      </footer>
    </main>
  );
}
