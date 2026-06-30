(function () {
  const config = window.APP_CONFIG || {};
  const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const client = hasSupabase
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  const fallbackStore = createFallbackStore();
  const gradeOptions = [
    "الأول الإعدادي",
    "الثاني الإعدادي",
    "الثالث الإعدادي",
    "الأول الثانوي",
    "الثاني الثانوي",
    "الثالث الثانوي"
  ];

  const state = {
    route: "home",
    routeId: null,
    search: "",
    authMode: "login",
    user: null,
    profile: null,
    dataLoading: false,
    postSocialLoaded: false,
    postSocialLoading: false,
    lessonCommentsLoaded: new Set(),
    lessonCommentsLoading: new Set(),
    loadingCourseId: null,
    courseLessonsLoaded: new Set(),
    courseLessonsLoading: new Set(),
    data: {
      profiles: [],
      courses: [],
      sections: [],
      lessons: [],
      enrollments: [],
      posts: [],
      comments: [],
      postLikes: [],
      supportMessages: [],
      aboutEntries: []
    },
    busy: false
  };

  const app = document.getElementById("app");

  document.addEventListener("DOMContentLoaded", boot);

  /* ══════════════════════════════════════════════
     CONTENT PROTECTION — ONLY active on video pages
     ══════════════════════════════════════════════ */

  /* Helper: only protect when watching a video */
  function isWatchingVideo() {
    return state.route === "lesson";
  }

  /* 1. Block right-click / long-press on video */
  document.addEventListener("contextmenu", (event) => {
    if (event.target.closest(".video-protected, .video-container")) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  });

  /* 2. Block keyboard shortcuts (Desktop) — only on video page */
  document.addEventListener("keydown", (event) => {
    if (!isWatchingVideo()) return;
    const key = event.key.toLowerCase();
    if (event.target.closest("input, textarea")) return;
    if (
      key === "printscreen" ||
      (event.ctrlKey && event.shiftKey && ["i", "j", "c", "s"].includes(key)) ||
      (event.ctrlKey && ["p", "s", "u"].includes(key)) ||
      key === "f12"
    ) {
      event.preventDefault();
      toast("المحتوى محمي. التصوير أو الطباعة غير مسموح.");
    }
  });

  /* 3. Visibility change — BLACK screen — only on video page */
  document.addEventListener("visibilitychange", () => {
    if (!isWatchingVideo()) return;
    if (document.hidden) {
      document.body.classList.add("privacy-black");
    } else {
      setTimeout(() => document.body.classList.remove("privacy-black"), 300);
    }
  });

  /* 4. Window blur/focus — only on video page */
  window.addEventListener("blur", () => {
    if (!isWatchingVideo()) return;
    document.body.classList.add("privacy-black");
  });
  window.addEventListener("focus", () => {
    document.body.classList.remove("privacy-black");
  });

  /* 5. Pause/Resume events (Mobile) — only on video page */
  window.addEventListener("pagehide", () => {
    if (!isWatchingVideo()) return;
    document.body.classList.add("privacy-black");
  });
  window.addEventListener("pageshow", () => {
    document.body.classList.remove("privacy-black");
  });

  /* 6. Mobile: block long-press on video elements */
  document.addEventListener("touchstart", (event) => {
    if (event.target.closest(".video-protected, .video-container, .video-box")) {
      event.target.style.webkitTouchCallout = "none";
    }
  }, { passive: true });

  /* 7. Mobile: detect iOS screenshot — only on video page */
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;
  window.addEventListener("resize", () => {
    if (!isWatchingVideo()) { lastWidth = window.innerWidth; lastHeight = window.innerHeight; return; }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (Math.abs(w - lastWidth) > 50 || Math.abs(h - lastHeight) > 50) {
      document.body.classList.add("privacy-black");
      toast("تم اكتشاف محاولة تصوير الشاشة.");
      setTimeout(() => document.body.classList.remove("privacy-black"), 2000);
    }
    lastWidth = w;
    lastHeight = h;
  });

  /* 8. Disable Picture-in-Picture */
  document.addEventListener("enterpictureinpicture", (e) => {
    e.preventDefault();
    toast("وضع الصورة المصغرة غير مسموح.");
  });

  /* 9. Block screen capture API */
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    navigator.mediaDevices.getDisplayMedia = function() {
      toast("تسجيل الشاشة غير مسموح أثناء المشاهدة.");
      return Promise.reject(new DOMException("Screen capture blocked", "NotAllowedError"));
    };
  }

  /* 10. Mobile: detect screen recording — only on video page */
  let blurFocusCount = 0;
  let blurFocusTimer = null;
  function trackBlurFocus() {
    if (!isWatchingVideo()) return;
    blurFocusCount++;
    if (blurFocusTimer) clearTimeout(blurFocusTimer);
    blurFocusTimer = setTimeout(() => {
      if (blurFocusCount >= 3) {
        document.body.classList.add("privacy-black");
        toast("تم اكتشاف محاولة تسجيل الشاشة. الفيديو محمي.");
        setTimeout(() => document.body.classList.remove("privacy-black"), 3000);
      }
      blurFocusCount = 0;
    }, 1000);
  }
  window.addEventListener("blur", trackBlurFocus);
  window.addEventListener("focus", trackBlurFocus);

  /* 11. Prevent drag on video elements */
  document.addEventListener("dragstart", (e) => {
    if (e.target.closest(".video-protected, .video-container")) {
      e.preventDefault();
    }
  });

  async function boot() {
    restoreTheme();
    renderSplash();

    /* Splash shows for exactly 3 seconds then fades — regardless of loading */
    const splashTimer = setTimeout(() => {
      const splash = document.querySelector(".splash");
      if (splash) splash.classList.add("hide");
    }, 3000);

    try {
      await loadSession();
      if (state.user) {
        const cached = localStorage.getItem("platformCache_" + state.user.id);
        if (cached) {
          try {
            state.data = JSON.parse(cached);
            state.dataLoading = false;
          } catch(e) {
            state.data = emptyData();
            state.dataLoading = true;
          }
        } else {
          state.data = emptyData();
          state.dataLoading = true;
        }
        render();
        loadData().then(() => {
          state.dataLoading = false;
          render();
        });
      } else {
        state.data = emptyData();
      }
      restoreRouteFromHash();
    } catch (err) {
      console.error("Boot error:", err);
    }

    /* If splash already hidden by timer, this is a no-op */
    const splash = document.querySelector(".splash");
    if (splash && !splash.classList.contains("hide")) {
      splash.classList.add("hide");
    }
    render();
  }

  /* Parse URL hash to restore route on refresh */
  function restoreRouteFromHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    if (!hash) return;
    const parts = hash.split("/");
    const route = parts[0] || "home";
    const id = parts[1] || null;
    if (["home","courses","course","lesson","posts","support","students","more"].includes(route)) {
      state.route = route;
      state.routeId = id;
    }
  }

  /* Listen for browser back/forward */
  window.addEventListener("hashchange", () => {
    closeVideoViewer();
    restoreRouteFromHash();
    render();
  });

  async function loadSession() {
    if (!hasSupabase) {
      return;
    }

    const { data } = await client.auth.getSession();
    if (!data.session) return;
    state.user = data.session.user;
    state.profile = await getOrCreateProfile(data.session.user);
  }

  async function loadData() {
    state.dataLoading = false;
    state.data = hasSupabase ? await loadSupabaseData() : emptyData();
    
    try {
      localStorage.setItem("platformCache_" + state.user.id, JSON.stringify(state.data));
    } catch(e) {}
    
    state.courseLessonsLoaded = new Set(state.data.courses.map((course) => course.id));
    state.postSocialLoaded = true;
    state.lessonCommentsLoaded = new Set(state.data.lessons.map((lesson) => lesson.id));
    state.dataLoading = false;
  }

  function emptyData() {
    return {
      profiles: [],
      courses: [],
      sections: [],
      lessons: [],
      enrollments: [],
      posts: [],
      comments: [],
      postLikes: [],
      supportMessages: [],
      aboutEntries: [],
      lessonCounts: {}
    };
  }

  async function loadSupabaseData() {
    const [
      profiles,
      courses,
      sections,
      lessons,
      enrollments,
      posts,
      comments,
      postLikes,
      supportMessages,
      aboutEntries,
      lessonCounts
    ] = await Promise.all([
      isAdmin() ? selectTable("profiles", 500) : Promise.resolve(state.profile ? [state.profile] : []),
      selectTable("courses", 200),
      selectTable("course_sections", 500),
      selectTable("lessons", 800),
      selectTable("enrollments", 1000),
      selectTable("posts", 120),
      selectTable("comments", 500),
      selectTable("post_likes", 2000),
      isAdmin() ? selectTable("support_messages", 200) : Promise.resolve([]),
      selectTable("about_entries", 100),
      loadLessonCounts()
    ]);

    return {
      profiles,
      courses,
      sections: sections.map(mapSection),
      lessons: lessons.map(mapLesson),
      enrollments,
      posts,
      comments,
      postLikes,
      supportMessages,
      aboutEntries,
      lessonCounts
    };
  }

  async function loadLessonCounts() {
    try {
      const { data, error } = await client.rpc("get_course_lesson_counts");
      if (error || !data) return {};
      const map = {};
      data.forEach((row) => { map[row.course_id] = Number(row.lesson_count); });
      return map;
    } catch (e) {
      return {};
    }
  }

  async function selectTable(table, limit = 200) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn(error);
      return [];
    }
    return data || [];
  }

  function mapSection(section) {
    return {
      id: section.id,
      courseId: section.course_id,
      title: section.title,
      imageUrl: section.image_url || "",
      sortOrder: section.sort_order || 0
    };
  }

  function mapLesson(lesson) {
    return {
      id: lesson.id,
      sectionId: lesson.section_id,
      title: lesson.title,
      videoUrl: lesson.video_url,
      thumbnailUrl: lesson.thumbnail_url,
      attachments: lesson.attachments || [],
      externalLinks: lesson.external_links || [],
      sortOrder: lesson.sort_order || 0
    };
  }

  function renderSplash() {
    app.innerHTML = `
      <div class="splash">
        <div class="splash-content">
          ${logoSvg("brand-mark splash-logo")}
          <h1>چيهان البراوي</h1>
          <p>لغة عربية بشكل أوضح</p>
          <div class="splash-loader"></div>
        </div>
      </div>
    `;
  }

  function render() {
    if (!state.user) {
      app.innerHTML = (hasSupabase ? renderAuth() : renderSetupRequired()) + renderThemeToggle(true);
      bindAuth();
      bindThemeToggle();
      return;
    }

    app.innerHTML = `
      <div class="layout">
        ${renderSidebar()}
        <div>
          ${renderTopbar()}
          <main class="main">${renderRoute()}</main>
          ${renderMobileNav()}
        </div>
      </div>
    `;
    bindGlobal();
    bindRoute();
    bindThemeToggle();
    initAboutCarousel();
  }

  let aboutCarouselTimer = null;
  
  function initAboutCarousel() {
    if (aboutCarouselTimer) {
      clearInterval(aboutCarouselTimer);
      aboutCarouselTimer = null;
    }
    
    const container = document.getElementById("about-carousel-container");
    if (!container) return;
    
    const slides = container.querySelectorAll("[data-about-slide]");
    if (slides.length <= 1) return;
    
    let currentIndex = 0;
    
    function showSlide(index) {
      slides.forEach(slide => {
        slide.classList.remove('active');
      });
      slides[index].classList.add('active');
      
      const counter = document.getElementById("about-carousel-counter");
      if (counter) counter.textContent = `${index + 1} / ${slides.length}`;
      currentIndex = index;
    }
    
    function nextSlide() {
      showSlide((currentIndex + 1) % slides.length);
    }
    
    function prevSlide() {
      showSlide((currentIndex - 1 + slides.length) % slides.length);
    }
    
    aboutCarouselTimer = setInterval(nextSlide, 5000);
    
    let touchStartX = 0;
    let touchEndX = 0;
    
    const stackArea = container.querySelector('.about-stack');
    if (stackArea) {
      stackArea.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });
      
      stackArea.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }, { passive: true });
    }
    
    function handleSwipe() {
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) nextSlide();
        else prevSlide();
        clearInterval(aboutCarouselTimer);
        aboutCarouselTimer = setInterval(nextSlide, 5000);
      }
    }
  }

  function renderAuth() {
    const isLogin = state.authMode === "login";
    return `
      <div class="auth-wrap animated-auth">
        <div class="scenery-bg">
          <div class="sky-gradient"></div>
          <div class="stars"></div>
          <div class="smoke-container">
            <div class="smoke s1"></div>
            <div class="smoke s2"></div>
            <div class="smoke s3"></div>
            <div class="smoke s4"></div>
          </div>
          <div class="fire-container">
            <div class="fire f1"></div>
            <div class="fire f2"></div>
            <div class="fire f3"></div>
            <div class="fire f4"></div>
            <div class="fire f5"></div>
          </div>
          <svg class="silhouettes" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <!-- Ground -->
            <path class="ground" d="M0,300 L1000,300 L1000,200 L0,200 Z" opacity="0.8"/>
            <path class="ground-dark" d="M0,300 L0,250 L100,280 L200,240 L350,300 Z" opacity="0.6"/>
            <path class="ground-dark" d="M1000,300 L1000,230 L900,270 L800,220 L650,300 Z" opacity="0.6"/>
            <!-- Volcano Base -->
            <path class="volcano-base" d="M150,300 L450,80 L550,80 L850,300 Z" opacity="0.9"/>
            <path class="volcano-shade" d="M500,80 L550,80 L850,300 L500,300 Z" opacity="0.3"/>
            <!-- Crater / Lava Spill -->
            <path fill="#ff4500" d="M450,80 Q500,100 550,80 L530,150 Q500,180 470,150 Z" class="lava-glow"/>
          </svg>
        </div>
        <section class="auth-card relative-z">
          <div class="brand">
            ${logoSvg("brand-mark")}
            <div>
              <h1>چيهان البراوي</h1>
              <p>منصة اللغة العربية</p>
            </div>
          </div>
          <div class="tabs">
            <button class="${isLogin ? "active" : ""}" data-auth-tab="login">تسجيل دخول</button>
            <button class="${!isLogin ? "active" : ""}" data-auth-tab="signup">إنشاء حساب</button>
          </div>
          <form class="form" data-auth-form>
            ${!isLogin ? `<label>الاسم<input class="field" name="name" required /></label>` : ""}
            <label>البريد الإلكتروني<input class="field" name="email" type="email" required /></label>
            <label>كلمة السر<input class="field" name="password" type="password" required minlength="6" /></label>
            ${!isLogin ? `<label>رقم الموبايل<input class="field" name="phone" type="tel" required /></label>` : ""}
            ${!isLogin ? `<label>الصف
              <select class="select" name="grade" required>
                <option value="">اختر الصف</option>
                ${renderGradeOptions()}
              </select>
            </label>` : ""}
            <button class="btn gold" type="submit">${isLogin ? "دخول" : "تسجيل"}</button>
            <p class="auth-credit">تم تصميم وتطوير المنصة بواسطة <a href="https://instagram.com/saeed_hadad1" target="_blank" rel="noreferrer">saeed hadad</a></p>
          </form>
        </section>
      </div>
    `;
  }

  function renderSetupRequired() {
    return `
      <div class="auth-wrap">
        <section class="auth-card">
          <div class="brand">
            ${logoSvg("brand-mark")}
            <div>
              <h1>چيهان البراوي</h1>
              <p>إعداد المنصة مطلوب</p>
            </div>
          </div>
          <h2>النسخة النهائية لا تحتوي على بيانات تجريبية</h2>
          <p class="muted">ضع بيانات Supabase في ملف config.js ثم شغل SQL الموجود في supabase/schema.sql. بعد ذلك أنشئ حساب المدرس من Supabase Auth بنفس البريد المحدد في app_settings.</p>
        </section>
      </div>
    `;
  }

  function renderSidebar() {
    return `
      <aside class="sidebar">
        <div class="brand">
          ${logoSvg("brand-mark")}
          <div>
            <h2>چيهان البراوي</h2>
            <p>لغة عربية</p>
          </div>
        </div>
        ${renderMainNav("nav")}
        <div class="user-card">
          <strong>${escapeHtml(state.profile.full_name)}</strong>
          <span class="muted">${escapeHtml(state.profile.email)}</span>
          <div style="margin-top:10px">${isAdmin() ? `<span class="pill gold">وضع المدرس</span>` : `<span class="pill">طالب</span>`}</div>
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            ${renderThemeToggle()}
            <button class="btn danger outline" data-logout style="flex: 1; display: flex; justify-content: center; align-items: center; gap: 8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              خروج
            </button>
          </div>
        </div>
      </aside>
    `;
  }

  function renderTopbar() {
    return `
      <header class="topbar">
        <div class="brand">
          ${logoSvg("brand-mark")}
          <div class="brand-text">
            <h2>چيهان البراوي</h2>
            <p>${isAdmin() ? "وضع المدرس" : "لغة عربية"}</p>
          </div>
        </div>
        <div class="topbar-actions" style="display: flex; align-items: center; gap: 8px;">
          ${renderThemeToggle()}
          <button class="btn ghost icon" data-logout title="خروج" style="width: 44px; height: 44px; padding: 0; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--line);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>
    `;
  }

  function renderMobileNav() {
    return renderMainNav("mobile-nav");
  }

  function renderMainNav(className) {
    const items = [
      ["home", "home", "الرئيسية"],
      ["courses", "courses", "الكورسات"],
      ["posts", "posts", "المنشورات"],
      ["support", "support", "الدعم"],
      ...(isAdmin() ? [["students", "students", "الطلاب"]] : []),
      ["more", "more", "المزيد"]
    ];
    return `
      <nav class="${className}">
        ${items
          .map(([route, icon, label]) => `
            <button class="${state.route === route ? "active" : ""}" data-route="${route}">
              ${iconSvg(icon)}<span>${label}</span>
            </button>
          `)
          .join("")}
      </nav>
    `;
  }

  function renderNav(className) {
    const items = [
      ["home", "⌂", "الرئيسية"],
      ["courses", "▦", "الكورسات"],
      ["posts", "◫", "المنشورات"],
      ["support", "✉", "الدعم"],
      ["more", "☰", "المزيد"]
    ];
    return `
      <nav class="${className}">
        ${items
          .map(([route, icon, label]) => `
            <button class="${state.route === route ? "active" : ""}" data-route="${route}">
              <span>${icon}</span><span>${label}</span>
            </button>
          `)
          .join("")}
      </nav>
    `;
  }

  function renderRoute() {
    if (state.dataLoading) return renderDataLoading();
    if (state.route === "courses") return renderCourses();
    if (state.route === "course") return renderCourseDetails(state.routeId);
    if (state.route === "lesson") return renderLesson(state.routeId);
    if (state.route === "posts") return renderPosts();
    if (state.route === "support") return renderSupport();
    if (state.route === "students") return renderStudentsAdmin();
    if (state.route === "more") return renderMore();
    return renderHome();
  }

  function renderDataLoading() {
    return `
      <section class="hero skeleton-box" style="height: 250px; border-radius: 16px; margin-bottom: 24px;"></section>
      <section class="section">
        <div class="section-title">
          <div class="skeleton-box" style="height: 30px; width: 200px; border-radius: 4px;"></div>
        </div>
        <div class="course-grid">
          ${Array(3).fill(`
            <article class="course-card">
              <div class="skeleton-box" style="height: 160px; border-radius: 12px 12px 0 0;"></div>
              <div class="course-body">
                <div class="skeleton-box" style="height: 20px; width: 60px; border-radius: 4px; margin-bottom: 12px;"></div>
                <div class="skeleton-box" style="height: 24px; width: 80%; border-radius: 4px; margin-bottom: 8px;"></div>
                <div class="skeleton-box" style="height: 16px; width: 100%; border-radius: 4px; margin-bottom: 16px;"></div>
                <div class="skeleton-box" style="height: 40px; width: 100%; border-radius: 8px;"></div>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderHome() {
    const activeEnrollments = state.data.enrollments.filter((e) => e.status === "active").length;
    return `
      <section class="hero">
        <div class="hero-panel">
          <span class="pill gold">منصة لغة عربية</span>
          <h2>افهم اللغة العربية من غير حفظ أعمى.</h2>
          <p>كورسات منظمة، فيديوهات مرتبة حسب الأقسام، ومتابعة من چيهان البراوي للطلاب خطوة بخطوة.</p>
          <div class="hero-actions">
            <button class="btn gold" data-route="courses">تصفح الكورسات</button>
            <button class="btn secondary" data-route="support">تواصل معانا</button>
          </div>
        </div>
        <aside class="side-panel card">
          <h3>ملخص المنصة</h3>
          <div class="kpi-grid">
            <div class="stat-card"><span>الكورسات</span><strong>${visibleCourses().length}</strong></div>
            <div class="stat-card"><span>الفيديوهات</span><strong>${state.data.lessons.length}</strong></div>
            <div class="stat-card"><span>اشتراكات مفعلة</span><strong>${activeEnrollments}</strong></div>
          </div>
        </aside>
      </section>
      ${renderAboutStrip()}
      <section class="section">
        <div class="section-title">
          <h2>الكورسات الأكثر أهمية</h2>
          <button class="btn ghost" data-route="courses">عرض الكل</button>
        </div>
        ${renderCourseStrip(visibleCourses().slice(0, 6))}
      </section>
      <section class="section">
        <div class="section-title">
          <h2>آخر المنشورات</h2>
          <button class="btn ghost" data-route="posts">كل المنشورات</button>
        </div>
        <div class="grid two">${visiblePosts().slice(0, 2).map(renderPostCard).join("")}</div>
      </section>
      ${isAdmin() ? renderAdminQuick() : ""}
    `;
  }

  function renderAboutStrip() {
    const entries = [...state.data.aboutEntries].sort((a, b) => {
      const order = Number(a.sort_order || a.sortOrder || 0) - Number(b.sort_order || b.sortOrder || 0);
      return order || new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (!entries.length && !isAdmin()) return "";

    return `
      <section class="section about-section" id="about-carousel-container">
        <div class="section-title">
          <div>
            <h2>نبذة عن چيهان البراوي</h2>
            <p class="muted">لمحات وصور من رحلة الشرح والمتابعة مع الطلاب.</p>
          </div>
          ${entries.length > 1 ? `
            <div class="row" style="gap: 8px;">
              <span class="pill gold" id="about-carousel-counter">1 / ${entries.length}</span>
            </div>
          ` : entries.length === 1 ? `<span class="pill gold">1 نبذة</span>` : ""}
        </div>
        ${isAdmin() ? renderAboutComposer() : ""}
        ${entries.length ? `
          <div class="about-stack ${entries.length > 1 ? 'is-stacked' : ''}">
            ${entries.map((entry, index) => `
              <article class="about-card ${index === 0 ? 'active' : ''}" data-about-slide="${index}">
                ${entry.image_url ? `<div class="about-image" style="${bg(entry.image_url)}"></div>` : ""}
                <div class="about-content">
                  <span class="pill">چيهان البراوي</span>
                  <h3>${escapeHtml(entry.title)}</h3>
                  <p>${escapeHtml(entry.body)}</p>
                  <div class="about-meta">
                    <span>${formatDate(entry.created_at)}</span>
                    ${isAdmin() ? `<button class="btn danger" data-delete-about="${entry.id}">حذف</button>` : ""}
                  </div>
                </div>
              </article>
            `).join("")}
          </div>
        ` : `<div class="empty">أضف أول نبذة للظهور في الصفحة الرئيسية.</div>`}
      </section>
    `;
  }

  function renderAboutComposer() {
    return `
      <div class="admin-box about-composer">
        <div class="composer-header">
          <div>
            <h3>إضافة نبذة عني</h3>
            <span class="muted">اكتب نبذة وارفع صورة، وستظهر للطلاب في الرئيسية.</span>
          </div>
        </div>
        <form class="form" data-about-form>
          <div class="admin-grid">
            <input class="field" name="title" required placeholder="عنوان النبذة" />
            <label>صورة من الجهاز<input class="field" name="imageFile" type="file" accept="image/*" /></label>
          </div>
          <textarea class="textarea" name="body" required placeholder="اكتب التفاصيل هنا..."></textarea>
          <button class="btn gold" type="submit">إضافة النبذة</button>
        </form>
      </div>
    `;
  }

  function renderCourses() {
    const courses = filterBySearch(visibleCourses(), ["title", "grade", "description"]);
    return `
      <section>
        <div class="section-title">
          <h2>الكورسات التعليمية</h2>
          <div class="row">
            <input class="search" data-search placeholder="ابحث باسم الكورس أو الصف" value="${escapeAttr(state.search)}" />
            ${isAdmin() ? `<button class="btn gold" data-toggle-course-form>➕ إضافة كورس جديد</button>` : ''}
          </div>
        </div>
        ${isAdmin() ? renderCourseEditor() : ''}
        ${renderCourseStrip(courses)}
      </section>
    `;
  }

  function renderGradeOptions(selected = "") {
    return gradeOptions
      .map((grade) => `<option value="${escapeAttr(grade)}" ${grade === selected ? "selected" : ""}>${escapeHtml(grade)}</option>`)
      .join("");
  }

  function renderCourseStrip(courses) {
    return `
      <div class="course-grid">
        ${courses.map(renderCourseCard).join("") || empty("لا توجد كورسات مطابقة.")}
      </div>
    `;
  }

  function renderCourseCard(course) {
    const enrollment = getEnrollment(course.id);
    const status = enrollment ? statusLabel(enrollment.status) : "غير مشترك";
    return `
      <article class="course-card">
        <div class="course-image" style="${bg(course.image_url)}"></div>
        <div class="course-body">
          <span class="pill">${escapeHtml(course.grade)}</span>
          <h3>${escapeHtml(course.title)}</h3>
          <p class="muted">${escapeHtml(course.description)}</p>
          <p class="price">${priceText(course)}</p>
          <div class="row">
            <span class="pill ${enrollment?.status === "active" ? "" : "gold"}">${status}</span>
            <span class="muted">${countLessons(course.id)} فيديو</span>
          </div>
          <div class="card-actions">
            <button class="btn" data-open-course="${course.id}">أقسام الكورس</button>
            ${renderBuyButton(course)}
          </div>
          ${isAdmin() ? renderCourseAdminActions(course) : ""}
        </div>
      </article>
    `;
  }

  function renderCourseAdminActions(course) {
    return `
      <div class="card-actions" style="margin-top:15px; border-top:1px solid #eee; padding-top:10px; gap:8px; flex-wrap:wrap;">
        <button class="btn ghost" data-edit-course="${course.id}">✏️ تعديل الكورس</button>
        <label class="btn ghost file-btn">🖼️ تغيير الصورة<input type="file" accept="image/*" data-course-image="${course.id}" /></label>
        <button class="btn ghost" data-toggle-course="${course.id}">${course.is_published === false ? "نشر" : "إخفاء"}</button>
        <button class="btn danger" data-delete-course="${course.id}">حذف الكورس</button>
      </div>
    `;
  }

  function renderBuyButton(course) {
    if (isAdmin()) return "";
    const enrollment = getEnrollment(course.id);
    if (enrollment?.status === "active") return "";
    if (Number(course.price) <= 0) return `<button class="btn gold" data-free-course="${course.id}">ابدأ الكورس المجاني</button>`;
    return `<button class="btn whatsapp" data-buy-course="${course.id}">شراء عبر واتساب</button>`;
  }

  function renderCourseDetails(courseId) {
    const course = state.data.courses.find((item) => item.id === courseId);
    if (!course) return empty("الكورس غير موجود.");
    const sections = state.data.sections
      .filter((section) => section.courseId === course.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const canWatch = canAccessCourse(course.id);
    const isPaid = Number(course.price) > 0;
    const enrollment = getEnrollment(course.id);
    const totalLessons = countLessons(course.id);
    const lessonsLoading = state.loadingCourseId === course.id || state.courseLessonsLoading.has(course.id);
    return `
      <section>
        <div class="section-title">
          <button class="btn ghost" data-route="courses">← رجوع للكورسات</button>
        </div>

        <div class="course-detail-header card">
          ${course.image_url ? `<div class="course-detail-cover" style="${bg(course.image_url)}"></div>` : ''}
          <div class="course-detail-info">
            <div class="row" style="gap:8px;margin-bottom:8px">
              <span class="pill">${escapeHtml(course.grade || 'عام')}</span>
              <span class="pill gold">${priceText(course)}</span>
              ${enrollment?.status === 'active' ? '<span class="pill">مشترك ✓</span>' : ''}
            </div>
            <h1 style="margin:0 0 8px">${escapeHtml(course.title)}</h1>
            <p class="muted" style="margin:0 0 12px;line-height:1.8">${escapeHtml(course.description)}</p>
            <div class="row">
              <span class="pill">📚 ${sections.length} قسم</span>
              <span class="pill">🎥 ${totalLessons} فيديو</span>
              <span class="pill">👩‍🏫 ${escapeHtml(course.teacher_name || 'چيهان البراوي')}</span>
            </div>
          </div>
        </div>

        ${isPaid && !canWatch ? `
          <div class="whatsapp-banner">
            <div>
              <h3>💰 ${course.price} جنيه / للكورس</h3>
              <p>تقدر تشوف محتوى الكورس. للاشتراك تواصل عبر واتساب وهيتم تفعيل حسابك.</p>
            </div>
            <button class="btn whatsapp" data-buy-course="${course.id}">📱 للتواصل لشراء الكورس اضغط هنا</button>
          </div>
        ` : ''}

        <div class="section-title" style="margin-top:24px">
          <h3>📚 أقسام الكورس (${sections.length})</h3>
          ${isAdmin() ? `<button class="btn gold" data-toggle-section-form>➕ إضافة قسم جديد</button>` : ''}
        </div>
        ${isAdmin() ? renderSectionEditor(course.id) : ''}
        <div class="list">
          ${sections
            .map((section) => renderSectionBlock(section, canWatch, lessonsLoading))
            .join('') || empty('لا توجد أقسام في هذا الكورس بعد.')}
        </div>
        ${renderCourseAttachments(course)}
      </section>
    `;
  }

  function renderCourseAttachments(course) {
    const attachments = course.attachments || [];
    if (!attachments.length && !isAdmin()) return "";
    return `
      <section class="section card">
        <div class="section-title">
          <h2>مرفقات الكورس</h2>
          <span class="pill">${attachments.length} ملف</span>
        </div>
        ${renderLinks("ملفات الشرح والأسئلة", attachments)}
      </section>
    `;
  }

  function renderSectionBlock(section, canWatch, lessonsLoading = false) {
    const lessons = state.data.lessons
      .filter((lesson) => lesson.sectionId === section.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return `
      <article class="card section-block">
        ${section.imageUrl ? `<div class="section-cover" style="${bg(section.imageUrl)}"></div>` : ""}
        <div class="section-title">
          <div>
            <h3>📁 ${escapeHtml(section.title)}</h3>
            ${section.description ? `<p class="muted" style="margin:5px 0 10px;font-size:14px;line-height:1.6">${escapeHtml(section.description)}</p>` : ""}
            <span class="pill">${lessonsLoading ? "جاري التحميل..." : `${lessons.length} فيديو`}</span>
          </div>
          ${isAdmin() ? `
            <div class="row">
              <button class="btn ghost" data-edit-section="${section.id}">تعديل القسم</button>
              <label class="btn ghost file-btn">🖼️ صورة<input type="file" accept="image/*" data-section-image="${section.id}" /></label>
              <button class="btn danger" data-delete-section="${section.id}">حذف القسم</button>
            </div>
          ` : ""}
        </div>
        ${isAdmin() ? renderLessonEditor(section.id) : ""}
        <div class="grid two">
          ${lessonsLoading
            ? `<div class="empty">جاري تحميل فيديوهات القسم...</div>`
            : lessons
            .map((lesson) => `
              <article class="lesson-card">
                <div class="lesson-thumb" style="${bg(lesson.thumbnailUrl)}"></div>
                <div class="lesson-body">
                  <h3>${escapeHtml(lesson.title)}</h3>
                  <button class="btn" data-open-lesson="${lesson.id}">افتح الفيديو</button>
                  ${isAdmin() ? `
                    <div class="card-actions" style="margin-top:10px">
                      <button class="btn ghost" data-edit-lesson="${lesson.id}">تعديل</button>
                      <label class="btn ghost file-btn">صورة الفيديو<input type="file" accept="image/*" data-lesson-image="${lesson.id}" /></label>
                      <button class="btn danger" data-delete-lesson="${lesson.id}">حذف</button>
                    </div>
                  ` : ""}
                </div>
              </article>
            `)
            .join("") || empty("لا توجد فيديوهات في هذا القسم.")}
        </div>
      </article>
    `;
  }

  function renderLesson(lessonId) {
    const lesson = state.data.lessons.find((item) => item.id === lessonId);
    if (!lesson) return empty("الفيديو غير موجود.");
    const section = state.data.sections.find((item) => item.id === lesson.sectionId);
    const course = state.data.courses.find((item) => item.id === section?.courseId);
    const canWatch = course && canAccessCourse(course.id);
    const isPaid = course && Number(course.price) > 0;
    const comments = state.data.comments.filter((comment) => comment.lesson_id === lesson.id || comment.lessonId === lesson.id);
    const commentsLoading = state.lessonCommentsLoading.has(lesson.id);
    return `
      <section>
        <div class="section-title">
          <div>
            <button class="btn ghost" data-open-course="${course?.id || ""}">رجوع للكورس</button>
            <h2>${escapeHtml(lesson.title)}</h2>
          </div>
        </div>
        ${
          canWatch
            ? renderVideoPlayer(lesson)
            : `<div class="locked">
                <div>
                  <h3>🔒 هذا الفيديو للمشتركين فقط</h3>
                  <p>اشترك في كورس "${escapeHtml(course?.title || '')}" عشان تقدر تشاهد الفيديو.</p>
                  ${isPaid ? `<button class="btn whatsapp" data-buy-course="${course.id}" style="margin-top:14px">📱 للتواصل لشراء الكورس اضغط هنا</button>` : ''}
                </div>
              </div>`
        }
        <div class="grid two section">
          <div class="card">
            <h3>المرفقات والروابط</h3>
            ${renderLinks("المرفقات", lesson.attachments)}
            ${renderLinks("روابط خارجية", lesson.externalLinks)}
          </div>
          <div class="card">
            <h3>التعليقات</h3>
            <form class="form" data-comment-form="${lesson.id}">
              <textarea class="textarea" name="body" required placeholder="اكتب تعليقك..." style="height:44px; resize:none; padding-top:10px;"></textarea>
              <button class="btn ghost" type="submit">إرسال</button>
            </form>
            <div class="list" style="margin-top:12px">
              ${commentsLoading ? `<p class="muted">جاري تحميل التعليقات...</p>` : comments.map(renderComment).join("") || `<p class="muted">لا توجد تعليقات بعد.</p>`}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderPosts() {
    const posts = filterBySearch(visiblePosts(), ["title", "body"]);
    return `
      <section>
        <div class="section-title">
          <h2>المنشورات</h2>
          <div class="row">
            ${state.postSocialLoading ? `<span class="pill gold">جاري تحميل التعليقات والإعجابات...</span>` : ""}
            <input class="search" data-search placeholder="ابحث في المنشورات" value="${escapeAttr(state.search)}" />
          </div>
        </div>
        ${isAdmin() ? renderPostComposer() : ""}
        <div class="grid two">${posts.map(renderPostCard).join("") || empty("لا توجد منشورات مطابقة.")}</div>
      </section>
    `;
  }

  function renderPostCard(post) {
    const comments = state.data.comments.filter((comment) => comment.post_id === post.id || comment.postId === post.id);
    const likes = state.data.postLikes.filter((like) => (like.post_id || like.postId) === post.id);
    const isLiked = likes.some((like) => (like.user_id || like.userId) === state.user?.id);
    const socialReady = state.postSocialLoaded || isAdmin();
    const showSocial = state.route === "posts" || isAdmin();
    return `
      <article class="post-card">
        ${post.image_url ? `<div class="post-image" style="${bg(post.image_url)}"></div>` : ""}
        <div class="post-body">
          <span class="pill gold">چيهان البراوي</span>
          <h3>${escapeHtml(post.title)}</h3>
          <p>${escapeHtml(post.body)}</p>
          ${showSocial ? `
            <div class="post-reactions">
              <button class="like-btn ${isLiked ? 'liked' : ''}" data-toggle-like="${post.id}">
                ${isLiked ? '❤️' : '🤍'} <span>${socialReady ? likes.length : "..."}</span>
              </button>
              <span class="muted">${socialReady ? `${comments.length} تعليق` : "التعليقات تتحمل..."}</span>
              <span class="muted">${formatDate(post.created_at)}</span>
            </div>
            <div class="post-comments-section">
              <form class="form" data-post-comment-form="${post.id}">
                <div class="comment-input-row">
                  <textarea class="textarea" name="body" required placeholder="اكتب تعليق..." style="height:44px; resize:none; padding-top:10px;"></textarea>
                  <button class="btn ghost" type="submit">إرسال</button>
                </div>
              </form>
              <div class="post-comments-list">
                ${!socialReady ? `<span class="muted">جاري تحميل التعليقات...</span>` : comments.slice(0, 5).map((comment) => {
                  const profile = findProfile(comment.user_id || comment.userId);
                  return `
                    <div class="post-comment-item">
                      <strong>${escapeHtml(profile?.full_name || 'طالب')}</strong>
                      <p>${escapeHtml(comment.body)}</p>
                    </div>
                  `;
                }).join("") || ''}
                ${comments.length > 5 ? `<span class="muted">و${comments.length - 5} تعليقات أخرى...</span>` : ''}
              </div>
            </div>
          ` : `<div class="post-reactions"><span class="muted">${formatDate(post.created_at)}</span><button class="btn ghost" data-route="posts">عرض التعليقات</button></div>`}
          ${isAdmin() ? renderPostAdminActions(post) : ""}
        </div>
      </article>
    `;
  }

  function renderPostAdminActions(post) {
    return `
      <div class="card-actions" style="margin-top:10px">
        <button class="btn ghost" data-edit-post="${post.id}">تعديل سريع</button>
        <button class="btn ghost" data-toggle-post="${post.id}">${post.is_published === false ? "نشر" : "إخفاء"}</button>
        <button class="btn danger" data-delete-post="${post.id}">حذف</button>
      </div>
    `;
  }

  function renderSupport() {
    return `
      <section>
        <div class="section-title">
          <div>
            <h2>الشكاوى والدعم</h2>
            <p class="muted">${isAdmin() ? 'رسائل الدعم الواردة من الطلاب.' : 'اكتب رسالتك وسيتم التواصل معك في أقرب وقت.'}</p>
          </div>
        </div>
        ${isAdmin() ? '' : `
        <div class="grid two">
          <form class="card form" data-support-form>
            <label>الاسم<input class="field" name="name" required readonly value="${escapeAttr(state.profile.full_name)}" style="opacity: 0.7; cursor: not-allowed;" /></label>
            <label>البريد<input class="field" name="email" type="email" required readonly value="${escapeAttr(state.profile.email)}" style="opacity: 0.7; cursor: not-allowed;" /></label>
            <label>رسالتك<textarea class="textarea" name="message" required></textarea></label>
            <button class="btn gold" type="submit">إرسال</button>
          </form>
          <div class="card">
            <h3>وسائل التواصل</h3>
            <p class="muted">لشراء الكورسات أو الاستفسار السريع استخدم واتساب.</p>
            <a class="btn whatsapp" href="${whatsappGeneralLink()}" target="_blank" rel="noreferrer">فتح واتساب</a>
          </div>
        </div>
        `}
        ${isAdmin() ? renderSupportInbox() : ""}
      </section>
    `;
  }

  function renderMore() {
    return `
      <section>
        <div class="section-title">
          <h2>المزيد</h2>
          <button class="btn danger" data-logout>تسجيل الخروج</button>
        </div>
        <div class="grid two">
          <div class="card">
            <h3>مكتبتي</h3>
            <div class="list" style="margin-top:12px">
              ${state.data.enrollments
                .filter((enrollment) => enrollment.user_id === state.user.id || enrollment.userId === state.user.id)
                .map((enrollment) => {
                  const course = state.data.courses.find((item) => item.id === (enrollment.course_id || enrollment.courseId));
                  return course
                    ? `<div class="list-item"><strong>${escapeHtml(course.title)}</strong><span class="pill">${statusLabel(enrollment.status)}</span></div>`
                    : "";
                })
                .join("") || empty("لا توجد كورسات في مكتبتك بعد.")}
            </div>
          </div>
          <div class="card">
            <h3>وصف المنصة</h3>
            <p>منصة تعليمية لچيهان البراوي لشرح اللغة العربية بأسلوب منظم وسهل، مع كورسات مدفوعة يتم تفعيلها يدويًا بعد التواصل.</p>
            <button class="btn ghost" data-share>مشاركة الموقع</button>
          </div>
        </div>
        ${isAdmin() ? renderAdminSettings() : ""}
      </section>
    `;
  }

  function renderAdminQuick() {
    return `
      <section class="section admin-box">
        <div class="section-title">
          <h2>أدوات المدرس السريعة</h2>
          <span class="pill gold">تظهر للمدرس فقط</span>
        </div>
        <div class="grid two">
          ${renderEnrollmentManager()}
          ${renderSupportInbox(true)}
        </div>
      </section>
    `;
  }

  function renderCourseEditor() {
    return `
      <div class="admin-box course-composer collapsible-form" data-course-form-area style="display:none">
        <div class="composer-header">
          <div>
            <h3>📝 إضافة كورس جديد</h3>
            <p class="muted">املأ البيانات الأساسية للكورس.</p>
          </div>
          <button class="btn ghost" data-toggle-course-form>✖ إغلاق</button>
        </div>
        <form class="form" data-course-form>
          <div class="form-step">
            <span class="step-badge">1</span>
            <h4>المعلومات الأساسية</h4>
          </div>
          <div class="admin-grid">
            <label>اسم الكورس *<input class="field" name="title" required placeholder="مثال: لغة عربية الصف الثالث الثانوي" /></label>
            <label>الصف الدراسي
              <select class="select" name="grade" required>
                <option value="">اختر الصف</option>
                ${renderGradeOptions()}
              </select>
            </label>
          </div>
          <label>وصف الكورس *<textarea class="textarea" name="description" required placeholder="اكتب وصف مختصر للطلاب عن محتوى الكورس"></textarea></label>

          <div class="form-step">
            <span class="step-badge">2</span>
            <h4>التسعير</h4>
          </div>
          <div class="admin-grid">
            <label>نوع الكورس
              <select class="select" name="accessType" data-access-type>
                <option value="free">🆓 مجاني</option>
                <option value="paid">💰 مدفوع</option>
              </select>
            </label>
            <label data-price-field>السعر بالجنيه<input class="field" name="price" type="number" min="0" placeholder="مثال: 500" /></label>
          </div>

          <div class="form-step">
            <span class="step-badge">3</span>
            <h4>الصور والميديا</h4>
          </div>
          <div class="admin-grid">
            <label>🖼️ صورة غلاف الكورس<input class="field" name="imageFile" type="file" accept="image/*" /></label>
            <label>🔗 أو رابط صورة<input class="field" name="imageUrl" placeholder="https://..." /></label>
          </div>

          <div class="form-step">
            <span class="step-badge">4</span>
            <h4>مرفقات (اختياري)</h4>
          </div>
          <div class="admin-grid">
            <label>📄 ملف شرح PDF<input class="field" name="explanationFile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" /></label>
            <label>📝 ملف أسئلة / واجب<input class="field" name="questionsFile" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" /></label>
          </div>

          <button class="btn gold" type="submit" style="margin-top:8px">✅ إنشاء الكورس</button>
        </form>
      </div>
    `;
  }

  function renderSectionEditor(courseId) {
    return `
      <div class="admin-box collapsible-form" data-section-form-area style="display:none">
        <div class="composer-header">
          <h3>📁 إضافة قسم جديد</h3>
          <button class="btn ghost" data-toggle-section-form>✖ إغلاق</button>
        </div>
        <form class="form" data-section-form="${courseId}">
          <div class="admin-grid">
            <label>اسم القسم *<input class="field" name="title" required placeholder="مثال: الفصل الأول — الحضارة المصرية" /></label>
            <label>🖼️ صورة القسم<input class="field" name="imageFile" type="file" accept="image/*" /></label>
          </div>
          <label>وصف القسم<textarea class="textarea" name="description" placeholder="اكتب وصفاً للقسم"></textarea></label>
          <div class="admin-grid">
            <label>🎥 رابط الفيديو (اختياري)<input class="field" name="videoUrl" placeholder="رابط YouTube أو Vimeo" /></label>
          </div>
          <button class="btn gold" type="submit">➕ إضافة القسم</button>
        </form>
      </div>
    `;
  }

  function renderLessonEditor(sectionId) {
    return `
      <div class="admin-box collapsible-form" data-lesson-form-area="${sectionId}" style="display:none;margin:0 16px 8px">
        <div class="composer-header">
          <h3>🎥 إضافة فيديو</h3>
          <button class="btn ghost" data-toggle-lesson-form="${sectionId}">✖ إغلاق</button>
        </div>
        <form class="form" data-lesson-form="${sectionId}">
          <div class="admin-grid">
            <label>عنوان الفيديو *<input class="field" name="title" required placeholder="مثال: الدرس الأول — مقدمة" /></label>
            <label>رابط الفيديو *<input class="field" name="videoUrl" required placeholder="رابط YouTube أو Vimeo" /></label>
          </div>
          <div class="admin-grid">
            <label>🖼️ صورة الفيديو<input class="field" name="thumbnailFile" type="file" accept="image/*" /></label>
            <label>🔗 أو رابط صورة<input class="field" name="thumbnailUrl" placeholder="رابط صورة مصغرة" /></label>
          </div>
          <label>🔗 رابط خارجي (اختياري)<input class="field" name="externalLink" placeholder="رابط خارجي إضافي" /></label>
          <button class="btn gold" type="submit">➕ إضافة الفيديو</button>
        </form>
      </div>
    `;
  }

  function renderPostEditor() {
    return `
      <div class="admin-box">
        <h3>إضافة منشور</h3>
        <form class="form admin-grid" data-post-form>
          <input class="field" name="title" required placeholder="عنوان المنشور" />
          <input class="field" name="imageUrl" placeholder="رابط صورة" />
          <textarea class="textarea" name="body" required placeholder="محتوى المنشور"></textarea>
          <button class="btn gold" type="submit">نشر</button>
        </form>
      </div>
    `;
  }

  function renderPostComposer() {
    return `
      <div class="admin-box post-composer">
        <div class="post-header">
          <div class="avatar">${logoSvg("avatar-logo")}</div>
          <div>
            <h3>اكتب بوست جديد</h3>
            <span class="muted">اكتب منشور وارفع صورة من الجهاز أو استخدم رابط صورة.</span>
          </div>
        </div>
        <form class="form" data-post-form>
          <input class="field" name="title" required placeholder="عنوان مختصر للبوست" />
          <textarea class="textarea" name="body" required placeholder="اكتب المنشور هنا..."></textarea>
          <div class="admin-grid">
            <label>صورة من الجهاز<input class="field" name="imageFile" type="file" accept="image/*" /></label>
            <label>أو رابط صورة<input class="field" name="imageUrl" placeholder="https://..." /></label>
          </div>
          <button class="btn gold" type="submit">نشر البوست</button>
        </form>
      </div>
    `;
  }

  function renderEnrollmentManager() {
    const pending = state.data.enrollments.filter((item) => item.status === "pending");
    return `
      <div class="card">
        <h3>طلبات التفعيل</h3>
        <div class="list" style="margin-top:12px">
          ${pending
            .map((item) => {
              const profile = findProfile(item.user_id || item.userId);
              const course = state.data.courses.find((courseItem) => courseItem.id === (item.course_id || item.courseId));
              return `
                <div class="list-item">
                  <div>
                    <strong>${escapeHtml(profile?.full_name || "طالب")}</strong>
                    <span class="muted">${escapeHtml(course?.title || "كورس")}</span>
                  </div>
                  <div class="row">
                    <button class="btn" data-enroll-status="${item.id}:active">تفعيل</button>
                    <button class="btn danger" data-enroll-status="${item.id}:rejected">رفض</button>
                  </div>
                </div>
              `;
            })
            .join("") || `<p class="muted">لا توجد طلبات حالية.</p>`}
        </div>
      </div>
    `;
  }

  function renderStudentsAdmin() {
    if (!isAdmin()) return empty("هذه الصفحة مخصصة للمدرس فقط.");
    const students = state.data.profiles.filter((profile) => profile.role !== "admin" && profile.email !== "gehanelberawy@gmail.com");
    return `
      <section>
        <div class="section-title">
          <div>
            <h2>إدارة الطلاب والحسابات</h2>
            <p class="muted">بعد ما الطالب يدفع، اختار اسمه والكورس واضغط حفظ بحالة مفعل.</p>
          </div>
        </div>
        <div class="grid two">
          <form class="card form" data-manual-enrollment-form>
            <h3>تفعيل كورس لطالب</h3>
            <label>الطالب
              <select class="select" name="userId" required>
                <option value="">اختر الطالب</option>
                ${students.map((student) => `<option value="${student.id}">${escapeHtml(student.full_name)} - ${escapeHtml(student.email)}</option>`).join("")}
              </select>
            </label>
            <label>الكورس
              <select class="select" name="courseId" required>
                <option value="">اختر الكورس</option>
                ${state.data.courses.map((course) => `<option value="${course.id}">${escapeHtml(course.title)} - ${priceText(course)}</option>`).join("")}
              </select>
            </label>
            <label>الحالة
              <select class="select" name="status" required>
                <option value="active">مفعل</option>
                <option value="pending">بانتظار الدفع</option>
                <option value="rejected">مرفوض</option>
              </select>
            </label>
            <button class="btn gold" type="submit">حفظ حالة الكورس</button>
          </form>
          ${renderEnrollmentManager()}
        </div>
        <section class="section">
          <div class="section-title">
            <h2>كل الطلاب</h2>
            <span class="pill">${students.length} طالب</span>
          </div>
          <div class="list">
            ${students.map(renderStudentRow).join("") || empty("لا يوجد طلاب بعد.")}
          </div>
        </section>
      </section>
    `;
  }

  function renderStudentRow(student) {
    const enrollments = state.data.enrollments.filter((item) => (item.user_id || item.userId) === student.id);
    const passwordText = student.login_password || "غير مسجل - اعمل Reset Password";
    const isActive = student.is_active !== false;
    return `
      <div class="list-item student-row">
        <div class="student-info">
          <strong>${escapeHtml(student.full_name)}</strong>
          <span class="muted">اليوزر: ${escapeHtml(student.email)}</span>
          ${student.phone ? `<span class="muted">📱 الموبايل: ${escapeHtml(student.phone)}</span>` : ''}
          ${studentGrade(student) ? `<span class="muted">📚 الصف: ${escapeHtml(studentGrade(student))}</span>` : ''}
          <span class="muted">ID: ${escapeHtml(student.id)}</span>
          <span class="pill gold">الباسورد: ${escapeHtml(passwordText)}</span>
          <div class="student-actions">
            <button class="btn ${isActive ? 'danger' : 'gold'}" data-toggle-student="${student.id}">${isActive ? '⛔ تعطيل الحساب' : '✅ تفعيل الحساب'}</button>
            <span class="pill ${isActive ? '' : 'red'}">${isActive ? 'حساب مفعل ✓' : 'حساب معطّل ✗'}</span>
          </div>
        </div>
        <div class="student-courses">
          ${enrollments
            .map((enrollment) => {
              const course = state.data.courses.find((item) => item.id === (enrollment.course_id || enrollment.courseId));
              return `<span class="pill ${enrollment.status === "active" ? "" : "gold"}">${escapeHtml(course?.title || "كورس")} - ${statusLabel(enrollment.status)}</span>`;
            })
            .join("") || `<span class="muted">لا توجد كورسات لهذا الطالب.</span>`}
        </div>
      </div>
    `;
  }

  function renderSupportInbox(compact = false) {
    const messages = compact ? state.data.supportMessages.slice(0, 3) : state.data.supportMessages;
    return `
      <div class="${compact ? "card" : "admin-box section"}">
        <h3>رسائل الدعم</h3>
        <div class="list" style="margin-top:12px">
          ${messages
            .map((message) => `
              <div class="list-item">
                <div>
                  <strong>${escapeHtml(message.name)}</strong>
                  <p class="muted">${escapeHtml(message.message)}</p>
                </div>
                <span class="pill ${message.status === "closed" ? "" : "gold"}">${message.status === "closed" ? "مغلقة" : "مفتوحة"}</span>
              </div>
            `)
            .join("") || `<p class="muted">لا توجد رسائل دعم.</p>`}
        </div>
      </div>
    `;
  }

  function renderAdminSettings() {
    return `
      <section class="section admin-box">
        <div class="section-title">
          <h2>إعدادات المدرس</h2>
          <span class="pill gold">تغيير حساب الأدمن</span>
        </div>
        <div class="grid two">
          <form class="form card" data-admin-promote-form>
            <h3>ترقية مستخدم إلى مدرس</h3>
            <input class="field" name="email" type="email" required placeholder="بريد المستخدم" />
            <button class="btn gold" type="submit">تعيين كـ admin</button>
          </form>
          <form class="form card" data-admin-demote-form>
            <h3>إزالة صلاحية مدرس</h3>
            <input class="field" name="email" type="email" required placeholder="بريد المستخدم" />
            <button class="btn danger" type="submit">إزالة الصلاحية</button>
            <p class="muted">لن يسمح النظام بإزالة آخر حساب admin.</p>
          </form>
        </div>
      </section>
    `;
  }

  function renderLinks(title, links) {
    if (!links || !links.length) return `<p class="muted">${title}: لا يوجد</p>`;
    return `
      <h4>${title}</h4>
      <div class="list">
        ${links
          .map((link) => `<a class="btn ghost" href="${escapeAttr(link.url || link)}" target="_blank" rel="noreferrer">${escapeHtml(link.label || "فتح الرابط")}</a>`)
          .join("")}
      </div>
    `;
  }

  /* ── YouTube IFrame API state ── */
  let ytPlayer = null;
  let ytPlayerReady = false;
  let ytProgressInterval = null;

  function renderVideoPlayer(lesson) {
    if (location.protocol === "file:" && youtubeIdFromUrl(lesson.videoUrl)) {
      return `
        <div class="video-box video-protected video-message">
          <div>
            <h3>الفيديو يحتاج تشغيل الموقع من رابط محلي</h3>
            <p>يوتيوب يرفض أحيانًا تشغيل الفيديو داخل iframe عندما يكون الموقع مفتوحًا كملف file://، لذلك يظهر Error 153. افتح رابط السيرفر المحلي الذي سأعطيه لك بدل فتح index.html مباشرة.</p>
          </div>
          <span class="video-watermark">${escapeHtml(state.profile.full_name)} - ${escapeHtml(state.profile.email)}</span>
        </div>
        <p class="muted protection-note">عند رفع الموقع على Netlify أو فتحه عبر http://localhost سيعمل الفيديو داخل المنصة.</p>
      `;
    }

    const ytId = youtubeIdFromUrl(lesson.videoUrl);
    const userLabel = `${escapeHtml(state.profile.full_name)} — ${escapeHtml(state.profile.email)}`;

    if (ytId) {
      /* YouTube video — use IFrame API with custom controls */
      return `
        <div class="video-container video-protected" data-yt-container oncontextmenu="return false;">
          <div class="video-box">
            <div id="yt-player-slot" data-yt-id="${ytId}"></div>
            <div class="video-drm-layer"></div>
            <div class="video-yt-cover-top"></div>
            <div class="video-yt-cover-bottom"></div>
            <div class="video-click-layer controls-active" data-yt-toggle-play></div>
            <span class="video-watermark">${userLabel}</span>
            <span class="video-watermark-center">${userLabel}</span>
          </div>
          <div class="video-controls" data-yt-controls>
            <button data-yt-play title="تشغيل / إيقاف">▶</button>
            <button data-yt-skip="-5" title="رجوع 5 ثوان">⟲5</button>
            <button data-yt-skip="5" title="تقديم 5 ثوان">5⟳</button>
            <div class="video-progress-bar" data-yt-progress>
              <div class="video-progress-fill" data-yt-progress-fill></div>
            </div>
            <span class="video-time" data-yt-time>0:00</span>
            <select class="video-speed" data-yt-speed title="سرعة التشغيل">
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1" selected>1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="1.75">1.75x</option>
              <option value="2">2x</option>
            </select>
            <button data-yt-mute title="صوت">🔊</button>
            <div class="video-volume-bar" data-yt-volume>
              <div class="video-volume-fill" data-yt-volume-fill></div>
            </div>
            <button data-yt-wide title="وضع عرضي">▭</button>
            <button data-yt-tall title="وضع طولي">▯</button>
            <button data-yt-fs title="تكبير الفيديو">⛶</button>
          </div>
        </div>
        <p class="muted protection-note">الفيديو محمي بعلامة مائية باسمك. أي مشاركة غير مصرح بها ستكون واضحة.</p>
      `;
    }

    /* Non-YouTube (Vimeo or other) — standard iframe with overlays */
    return `
      <div class="video-container video-protected">
        <div class="video-box">
          <iframe src="${embedUrl(lesson.videoUrl)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope" title="${escapeAttr(lesson.title)}"></iframe>
          <div class="video-drm-layer"></div>
          <span class="video-watermark">${userLabel}</span>
          <span class="video-watermark-center">${userLabel}</span>
        </div>
      </div>
      <p class="muted protection-note">الفيديو محمي بعلامة مائية باسمك. أي مشاركة غير مصرح بها ستكون واضحة.</p>
    `;
  }

  /* Initialize YouTube player after DOM renders */
  function initYouTubePlayer() {
    const slot = document.getElementById("yt-player-slot");
    if (!slot || !window.YT || !window.YT.Player) return;
    const ytId = slot.dataset.ytId;
    if (!ytId) return;

    if (ytPlayer) {
      try { ytPlayer.destroy(); } catch(e) {}
      ytPlayer = null;
      ytPlayerReady = false;
    }
    if (ytProgressInterval) { clearInterval(ytProgressInterval); ytProgressInterval = null; }

    ytPlayer = new YT.Player("yt-player-slot", {
      videoId: ytId,
      width: "100%",
      height: "100%",
      playerVars: {
        controls: 0,
        modestbranding: 1,
        rel: 0,
        showinfo: 0,
        fs: 0,
        iv_load_policy: 3,
        disablekb: 1,
        playsinline: 1,
        cc_load_policy: 0,
        origin: location.origin
      },
      events: {
        onReady: onYTReady,
        onStateChange: onYTStateChange
      }
    });
  }

  function onYTReady() {
    ytPlayerReady = true;
    bindYTControls();
  }

  function onYTStateChange(event) {
    const playBtn = document.querySelector("[data-yt-play]");
    if (!playBtn) return;
    if (event.data === YT.PlayerState.PLAYING) {
      playBtn.textContent = "⏸";
      startYTProgress();
    } else {
      playBtn.textContent = "▶";
      stopYTProgress();
    }
  }

  function bindYTControls() {
    /* Play / Pause */
    const playBtn = document.querySelector("[data-yt-play]");
    if (playBtn) playBtn.addEventListener("click", toggleYTPlay);

    /* Click-to-play layer */
    const clickLayer = document.querySelector("[data-yt-toggle-play]");
    if (clickLayer) clickLayer.addEventListener("click", toggleYTPlay);

    /* Progress bar seek */
    const progressBar = document.querySelector("[data-yt-progress]");
    if (progressBar) progressBar.addEventListener("click", (e) => {
      if (!ytPlayerReady) return;
      const rect = progressBar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const duration = ytPlayer.getDuration();
      ytPlayer.seekTo(duration * ratio, true);
    });

    /* Mute button */
    const muteBtn = document.querySelector("[data-yt-mute]");
    if (muteBtn) muteBtn.addEventListener("click", () => {
      if (!ytPlayerReady) return;
      if (ytPlayer.isMuted()) {
        ytPlayer.unMute();
        muteBtn.textContent = "🔊";
      } else {
        ytPlayer.mute();
        muteBtn.textContent = "🔇";
      }
    });

    /* Volume bar */
    const volumeBar = document.querySelector("[data-yt-volume]");
    if (volumeBar) volumeBar.addEventListener("click", (e) => {
      if (!ytPlayerReady) return;
      const rect = volumeBar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      ytPlayer.setVolume(ratio * 100);
      const fill = document.querySelector("[data-yt-volume-fill]");
      if (fill) fill.style.width = (ratio * 100) + "%";
    });

    /* Large viewer */
    const fsBtn = document.querySelector("[data-yt-fs]");
    if (fsBtn) fsBtn.addEventListener("click", () => {
      const container = document.querySelector("[data-yt-container]");
      if (!container) return;
      const isExpanded = container.classList.contains("video-expanded") || !!document.fullscreenElement;
      if (isExpanded) {
        if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen().catch(()=>{});
        container.classList.remove("video-expanded");
        document.body.classList.remove("video-modal-open");
        fsBtn.textContent = "⛶";
      } else {
        if (container.requestFullscreen) container.requestFullscreen().catch(()=>{});
        container.classList.add("video-expanded");
        document.body.classList.add("video-modal-open");
        fsBtn.textContent = "✖";
      }
    });

    const wideBtn = document.querySelector("[data-yt-wide]");
    if (wideBtn) wideBtn.addEventListener("click", () => setVideoAspect("wide"));

    const tallBtn = document.querySelector("[data-yt-tall]");
    if (tallBtn) tallBtn.addEventListener("click", () => setVideoAspect("tall"));

    /* Skip forward / backward */
    document.querySelectorAll("[data-yt-skip]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!ytPlayerReady) return;
        const offset = Number(btn.dataset.ytSkip);
        const current = ytPlayer.getCurrentTime();
        ytPlayer.seekTo(Math.max(0, current + offset), true);
      });
    });

    /* Playback speed */
    const speedSelect = document.querySelector("[data-yt-speed]");
    if (speedSelect) speedSelect.addEventListener("change", () => {
      if (!ytPlayerReady) return;
      ytPlayer.setPlaybackRate(Number(speedSelect.value));
    });
  }

  function toggleYTPlay() {
    if (!ytPlayerReady) return;
    const playerState = ytPlayer.getPlayerState();
    if (playerState === YT.PlayerState.PLAYING) {
      ytPlayer.pauseVideo();
    } else {
      ytPlayer.playVideo();
    }
  }

  function setVideoAspect(mode) {
    const container = document.querySelector("[data-yt-container]");
    if (!container) return;
    container.classList.toggle("video-portrait", mode === "tall");
    container.classList.toggle("video-landscape", mode !== "tall");
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const container = document.querySelector("[data-yt-container].video-expanded");
    if (!container) return;
    container.classList.remove("video-expanded");
    document.body.classList.remove("video-modal-open");
    const fsBtn = document.querySelector("[data-yt-fs]");
    if (fsBtn) fsBtn.textContent = "⛶";
  });

  function startYTProgress() {
    stopYTProgress();
    ytProgressInterval = setInterval(updateYTProgress, 500);
  }

  function stopYTProgress() {
    if (ytProgressInterval) { clearInterval(ytProgressInterval); ytProgressInterval = null; }
  }

  function updateYTProgress() {
    if (!ytPlayerReady) return;
    const current = ytPlayer.getCurrentTime();
    const duration = ytPlayer.getDuration();
    const fill = document.querySelector("[data-yt-progress-fill]");
    const timeEl = document.querySelector("[data-yt-time]");
    if (fill && duration > 0) fill.style.width = ((current / duration) * 100) + "%";
    if (timeEl) timeEl.textContent = formatVideoTime(current) + " / " + formatVideoTime(duration);
  }

  function formatVideoTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + String(s).padStart(2, "0");
  }

  function renderComment(comment) {
    const profile = findProfile(comment.user_id || comment.userId);
    return `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(profile?.full_name || "طالب")}</strong>
          <p>${escapeHtml(comment.body)}</p>
        </div>
      </div>
    `;
  }

  function bindAuth() {
    if (!hasSupabase) return;
    document.querySelectorAll("[data-auth-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.authMode = button.dataset.authTab;
        render();
      });
    });
    document.querySelector("[data-auth-form]").addEventListener("submit", handleAuthSubmit);
  }

  function bindGlobal() {
    document.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.route));
    });
    document.querySelectorAll("[data-logout]").forEach((button) => {
      button.addEventListener("click", logout);
    });
  }

  function bindRoute() {
    const search = document.querySelector("[data-search]");
    if (search) {
      search.addEventListener("input", (event) => {
        state.search = event.target.value;
        const cursorPosition = event.target.selectionStart;
        render();
        const newSearch = document.querySelector("[data-search]");
        if (newSearch) {
          newSearch.focus();
          newSearch.setSelectionRange(cursorPosition, cursorPosition);
        }
      });
    }
    
    bindClicks("[data-toggle-course-form]", () => {
      const area = document.querySelector("[data-course-form-area]");
      if (area) area.style.display = area.style.display === "none" ? "block" : "none";
    });

    bindClicks("[data-toggle-section-form]", () => {
      const area = document.querySelector("[data-section-form-area]");
      if (area) area.style.display = area.style.display === "none" ? "block" : "none";
    });

    bindClicks("[data-open-course]", (node) => openCourse(node.dataset.openCourse));
    bindClicks("[data-open-lesson]", (node) => navigate("lesson", node.dataset.openLesson));
    bindClicks("[data-buy-course]", (node) => buyCourse(node.dataset.buyCourse));
    bindClicks("[data-free-course]", (node) => activateFreeCourse(node.dataset.freeCourse));
    bindClicks("[data-edit-course]", (node) => editCourse(node.dataset.editCourse));
    bindClicks("[data-toggle-course]", (node) => toggleCourse(node.dataset.toggleCourse));
    bindClicks("[data-delete-course]", (node) => deleteCourse(node.dataset.deleteCourse));
    bindClicks("[data-edit-section]", (node) => editSection(node.dataset.editSection));
    bindClicks("[data-delete-section]", (node) => deleteSection(node.dataset.deleteSection));
    bindClicks("[data-edit-lesson]", (node) => editLesson(node.dataset.editLesson));
    bindClicks("[data-delete-lesson]", (node) => deleteLesson(node.dataset.deleteLesson));
    bindImageInputs("[data-course-image]", updateCourseImage);
    bindImageInputs("[data-section-image]", updateSectionImage);
    bindImageInputs("[data-lesson-image]", updateLessonImage);
    bindClicks("[data-edit-post]", (node) => editPost(node.dataset.editPost));
    bindClicks("[data-toggle-post]", (node) => togglePost(node.dataset.togglePost));
    bindClicks("[data-delete-post]", (node) => deletePost(node.dataset.deletePost));
    bindClicks("[data-toggle-like]", (node) => toggleLike(node.dataset.toggleLike));
    bindClicks("[data-toggle-student]", (node) => toggleStudentActive(node.dataset.toggleStudent));
    bindClicks("[data-course-scroll]", (node) => scrollCourses(node));
    bindClicks("[data-delete-about]", (node) => deleteAboutEntry(node.dataset.deleteAbout));

    bindClicks("[data-enroll-status]", (node) => {
      const [id, status] = node.dataset.enrollStatus.split(":");
      updateEnrollment(id, status);
    });

    bindForm("[data-course-form]", addCourse);
    const accessType = document.querySelector("[data-access-type]");
    if (accessType) {
      const priceField = document.querySelector("[data-price-field]");
      const syncPrice = () => {
        if (!priceField) return;
        priceField.style.display = accessType.value === "paid" ? "grid" : "none";
      };
      accessType.addEventListener("change", syncPrice);
      syncPrice();
    }
    bindForms("[data-section-form]", (form) => addSection(form.dataset.sectionForm, form));
    bindForms("[data-lesson-form]", (form) => addLesson(form.dataset.lessonForm, form));
    bindForm("[data-post-form]", addPost);
    bindForm("[data-about-form]", addAboutEntry);
    bindForm("[data-support-form]", addSupportMessage);
    bindForm("[data-manual-enrollment-form]", saveManualEnrollment);
    bindForms("[data-comment-form]", (form) => addLessonComment(form.dataset.commentForm, form));
    bindForms("[data-post-comment-form]", (form) => addPostComment(form.dataset.postCommentForm, form));
    bindForm("[data-admin-promote-form]", (form) => changeAdmin(form, true));
    bindForm("[data-admin-demote-form]", (form) => changeAdmin(form, false));

    const share = document.querySelector("[data-share]");
    if (share) share.addEventListener("click", shareSite);
    bindCourseWheel();

    /* Initialize YouTube custom player if on a lesson page */
    if (state.route === "lesson") {
      setTimeout(initYouTubePlayer, 100);
      ensureLessonComments(state.routeId);
    }
    if (state.route === "posts") {
      ensurePostSocials();
    }
    if (state.route === "course" && state.routeId) {
      ensureCourseLessons(state.routeId);
    }
  }

  async function openCourse(courseId) {
    navigate("course", courseId);
    await ensureCourseLessons(courseId);
  }

  async function ensureCourseLessons(courseId) {
    if (!hasSupabase || !courseId || state.courseLessonsLoaded.has(courseId) || state.courseLessonsLoading.has(courseId)) return;
    state.courseLessonsLoading.add(courseId);
    state.loadingCourseId = courseId;
    render();
    await loadCourseLessons(courseId);
    state.courseLessonsLoading.delete(courseId);
    state.loadingCourseId = null;
    render();
  }

  async function loadCourseLessons(courseId) {
    const sectionIds = state.data.sections.filter((section) => section.courseId === courseId).map((section) => section.id);
    if (!sectionIds.length) {
      state.courseLessonsLoaded.add(courseId);
      return;
    }
    const { data, error } = await client
      .from("lessons")
      .select("*")
      .in("section_id", sectionIds)
      .order("sort_order", { ascending: true });
    if (error) {
      console.warn(error);
      toast("تعذر تحميل فيديوهات الكورس. تأكد من تشغيل SQL الجديد في Supabase.");
      return;
    }
    const incoming = (data || []).map(mapLesson);
    const incomingIds = new Set(incoming.map((lesson) => lesson.id));
    state.data.lessons = state.data.lessons
      .filter((lesson) => !sectionIds.includes(lesson.sectionId) || !incomingIds.has(lesson.id))
      .concat(incoming);
    state.courseLessonsLoaded.add(courseId);
  }

  async function ensurePostSocials() {
    if (!hasSupabase || state.postSocialLoaded || state.postSocialLoading) return;
    state.postSocialLoading = true;
    render();
    await loadPostSocials();
    state.postSocialLoaded = true;
    state.postSocialLoading = false;
    render();
  }

  async function loadPostSocials() {
    const [commentsResult, likesResult] = await Promise.all([
      client.from("comments").select("*").not("post_id", "is", null).order("created_at", { ascending: false }).limit(500),
      client.from("post_likes").select("*").order("created_at", { ascending: false }).limit(2000)
    ]);
    if (commentsResult.error) console.warn(commentsResult.error);
    if (likesResult.error) console.warn(likesResult.error);
    const postComments = commentsResult.data || [];
    state.data.comments = state.data.comments.filter((comment) => !(comment.post_id || comment.postId)).concat(postComments);
    state.data.postLikes = likesResult.data || [];
  }

  async function ensureLessonComments(lessonId) {
    if (!hasSupabase || !lessonId || state.lessonCommentsLoaded.has(lessonId) || state.lessonCommentsLoading.has(lessonId)) return;
    state.lessonCommentsLoading.add(lessonId);
    render();
    await loadLessonComments(lessonId);
    state.lessonCommentsLoading.delete(lessonId);
    state.lessonCommentsLoaded.add(lessonId);
    render();
  }

  async function loadLessonComments(lessonId) {
    const { data, error } = await client
      .from("comments")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn(error);
      return;
    }
    state.data.comments = state.data.comments
      .filter((comment) => (comment.lesson_id || comment.lessonId) !== lessonId)
      .concat(data || []);
  }

  function scrollCourses(button) {
    const strip = button.closest(".course-carousel")?.querySelector("[data-course-strip]");
    if (!strip) return;
    const amount = Math.min(380, Math.max(280, strip.clientWidth * 0.72));
    const direction = button.dataset.courseScroll === "next" ? 1 : -1;
    strip.scrollBy({ left: amount * direction, behavior: "smooth" });
  }

  function bindCourseWheel() {
    document.querySelectorAll("[data-course-strip]").forEach((strip) => {
      strip.addEventListener("wheel", (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        strip.scrollLeft += event.deltaY;
      }, { passive: false });
    });
  }

  function bindClicks(selector, handler) {
    document.querySelectorAll(selector).forEach((node) => node.addEventListener("click", () => handler(node)));
  }

  function bindForm(selector, handler) {
    const form = document.querySelector(selector);
    if (form) form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler(form);
    });
  }

  function bindForms(selector, handler) {
    document.querySelectorAll(selector).forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handler(form);
      });
    });
  }

  function bindImageInputs(selector, handler) {
    document.querySelectorAll(selector).forEach((input) => {
      input.addEventListener("change", () => handler(input));
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector('button[type="submit"]');
    const values = formValues(form);
    if (!hasSupabase) {
      toast("اضبط Supabase أولًا من config.js.");
      return;
    }

    /* Show loading state */
    if (btn) { btn.disabled = true; btn.textContent = "جاري التحميل..."; }

    if (state.authMode === "signup") {
      const { data, error } = await client.auth.signUp({
        email: values.email,
        password: values.password,
        options: { data: { full_name: values.name, login_password: values.password, phone: values.phone || '', grade: values.grade || '' } }
      });
      if (error) { if (btn) { btn.disabled = false; btn.textContent = "إنشاء حساب"; } return toast(friendlyAuthError(error.message)); }
      if (!data.user) { if (btn) { btn.disabled = false; btn.textContent = "إنشاء حساب"; } return toast("حدث خطأ غير متوقع. حاول مرة أخرى."); }
      state.user = data.user;
      state.profile = await getOrCreateProfile(data.user, values.name, values.phone, values.grade);
    } else {
      const { data, error } = await client.auth.signInWithPassword({
        email: values.email,
        password: values.password
      });
      if (error) { if (btn) { btn.disabled = false; btn.textContent = "تسجيل الدخول"; } return toast(friendlyAuthError(error.message)); }
      state.user = data.user;
      state.profile = await getOrCreateProfile(data.user);

      /* Check if account is deactivated */
      if (state.profile && state.profile.is_active === false) {
        await client.auth.signOut();
        state.user = null;
        state.profile = null;
        if (btn) { btn.disabled = false; btn.textContent = "تسجيل الدخول"; }
        return toast("حسابك معطّل. تواصل مع الإدارة لإعادة التفعيل.");
      }
    }

    /* Render home page IMMEDIATELY — don't wait for data */
    state.data = emptyData();
    render();
    toast("مرحباً " + (state.profile?.full_name || "") + "! جاري تحميل البيانات...");

    /* Load data in background then re-render */
    loadData().then(() => render());
  }

  function friendlyAuthError(msg) {
    const lower = (msg || "").toLowerCase();
    if (lower.includes("invalid login") || lower.includes("invalid email or password"))
      return "البريد أو كلمة السر غلط. تأكد من البيانات وحاول تاني.";
    if (lower.includes("email not confirmed"))
      return "لازم تأكد بريدك الإلكتروني الأول. افتح الإيميل واضغط على رابط التأكيد.";
    if (lower.includes("user not found") || lower.includes("no user found") || lower.includes("email not found"))
      return "الإيميل ده مش مسجل عندنا. اعمل حساب جديد أو تأكد من الإيميل.";
    if (lower.includes("already registered") || lower.includes("already been registered"))
      return "الإيميل ده مسجل بالفعل. جرب تسجيل الدخول بدل إنشاء حساب.";
    if (lower.includes("too many requests") || lower.includes("rate limit"))
      return "محاولات كتير. استنى شوية وحاول تاني.";
    if (lower.includes("weak password") || lower.includes("password"))
      return "كلمة السر ضعيفة. استخدم 6 حروف على الأقل.";
    if (lower.includes("network") || lower.includes("fetch"))
      return "مفيش اتصال بالإنترنت. تأكد من الاتصال وحاول تاني.";
    return msg || "حدث خطأ. حاول مرة أخرى.";
  }

  async function getOrCreateProfile(user, name = "", phone = "", grade = "") {
    const { data } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) return data;
    const profile = {
      id: user.id,
      full_name: name || user.user_metadata?.full_name || user.email.split("@")[0],
      email: user.email,
      role: user.email === "gehanelberawy@gmail.com" ? "admin" : "student",
      login_password: user.user_metadata?.login_password || "",
      phone: phone || user.user_metadata?.phone || "",
      grade: grade || user.user_metadata?.grade || user.user_metadata?.semester || "",
      semester: user.user_metadata?.semester || "",
      is_active: true
    };
    const { error } = await client.from("profiles").insert(profile);
    if (error) console.warn(error);
    return profile;
  }

  async function logout() {
    if (hasSupabase) await client.auth.signOut();
    state.user = null;
    state.profile = null;
    state.route = "home";
    state.routeId = null;
    location.hash = "";
    render();
  }

  async function addCourse(form) {
    const values = formValues(form);
    const imageFile = form.elements.imageFile?.files?.[0];
    const uploadedImage = imageFile ? await fileToAssetUrl(imageFile, "course-covers") : "";
    const attachments = await collectCourseAttachments(form);
    const isFree = values.accessType !== "paid";
    const price = isFree ? 0 : Number(values.price || 0);
    const record = {
      title: values.title,
      grade: values.grade || "عام",
      price,
      description: values.description,
      image_url: uploadedImage || values.imageUrl,
      attachments,
      teacher_name: "چيهان البراوي",
      is_published: true
    };
    let courseId = "";
    if (hasSupabase) {
      const { data, error } = await client.from("courses").insert(record).select("id").single();
      if (error) return toast(error.message);
      courseId = data.id;
    } else {
      courseId = fallbackStore.addCourse(record);
    }

    await reload("تم إضافة الكورس.");
  }

  async function addSection(courseId, form) {
    const values = formValues(form);
    const imageFile = form.elements.imageFile?.files?.[0];
    const imageUrl = imageFile ? await fileToAssetUrl(imageFile, "section-images") : "";
    const record = { course_id: courseId, title: values.title, description: values.description || "", image_url: imageUrl, sort_order: countSections(courseId) + 1 };
    
    let sectionId = "";
    if (hasSupabase) {
      const { data, error } = await client.from("course_sections").insert(record).select("id").single();
      if (error) return toast(error.message);
      sectionId = data.id;
    } else {
      sectionId = fallbackStore.addSection({ courseId, title: values.title, description: values.description || "", imageUrl, sortOrder: countSections(courseId) + 1 });
    }

    if (values.videoUrl) {
      const videoThumbnail = youtubeThumbnail(values.videoUrl);
      const lessonRecord = {
        section_id: sectionId,
        title: values.title,
        video_url: values.videoUrl,
        thumbnail_url: imageUrl || videoThumbnail,
        external_links: [],
        attachments: [],
        sort_order: 1
      };
      if (hasSupabase) {
        const { error } = await client.from("lessons").insert(lessonRecord);
        if (error) return toast(error.message);
      } else {
        fallbackStore.addLesson({
          sectionId,
          title: values.title,
          videoUrl: values.videoUrl,
          thumbnailUrl: imageUrl || videoThumbnail,
          externalLinks: [],
          attachments: [],
          sortOrder: 1
        });
      }
    }

    await reload("تم إضافة القسم.");
  }

  async function addLesson(sectionId, form) {
    const values = formValues(form);
    const thumbnailFile = form.elements.thumbnailFile?.files?.[0];
    const uploadedThumbnail = thumbnailFile ? await fileToAssetUrl(thumbnailFile, "lesson-thumbnails") : "";
    const videoThumbnail = youtubeThumbnail(values.videoUrl);
    const record = {
      section_id: sectionId,
      title: values.title,
      video_url: values.videoUrl,
      thumbnail_url: uploadedThumbnail || values.thumbnailUrl || videoThumbnail,
      external_links: values.externalLink ? [{ label: "رابط خارجي", url: values.externalLink }] : [],
      attachments: [],
      sort_order: state.data.lessons.filter((lesson) => lesson.sectionId === sectionId).length + 1
    };
    if (hasSupabase) {
      const { error } = await client.from("lessons").insert(record);
      if (error) return toast(error.message);
    } else {
      fallbackStore.addLesson({
        sectionId,
        title: values.title,
        videoUrl: values.videoUrl,
        thumbnailUrl: uploadedThumbnail || values.thumbnailUrl || videoThumbnail,
        externalLinks: record.external_links,
        attachments: [],
        sortOrder: record.sort_order
      });
    }
    await reload("تم إضافة الفيديو.");
  }

  async function addPost(form) {
    const values = formValues(form);
    const imageFile = form.elements.imageFile?.files?.[0];
    const uploadedImage = imageFile ? await fileToAssetUrl(imageFile, "post-images") : "";
    const record = {
      author_id: state.user.id,
      title: values.title,
      body: values.body,
      image_url: uploadedImage || values.imageUrl,
      is_published: true
    };
    if (hasSupabase) {
      const { error } = await client.from("posts").insert(record);
      if (error) return toast(error.message);
    } else {
      fallbackStore.addPost(record);
    }
    await reload("تم نشر المنشور.");
  }

  async function addAboutEntry(form) {
    const values = formValues(form);
    const imageFile = form.elements.imageFile?.files?.[0];
    const uploadedImage = imageFile ? await fileToAssetUrl(imageFile, "about-images") : "";
    const record = {
      title: values.title,
      body: values.body,
      image_url: uploadedImage,
      sort_order: state.data.aboutEntries.length + 1
    };
    if (hasSupabase) {
      const { error } = await client.from("about_entries").insert(record);
      if (error) return toast(error.message);
    } else {
      state.data.aboutEntries.unshift({ ...record, id: "about-" + Date.now(), created_at: new Date().toISOString() });
    }
    await reload("تم إضافة النبذة.");
  }

  async function deleteAboutEntry(entryId) {
    if (!confirm("حذف هذه النبذة؟")) return;
    if (hasSupabase) {
      const { error } = await client.from("about_entries").delete().eq("id", entryId);
      if (error) return toast(error.message);
    } else {
      state.data.aboutEntries = state.data.aboutEntries.filter((entry) => entry.id !== entryId);
    }
    await reload("تم حذف النبذة.");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function fileToAssetUrl(file, folder) {
    if (!hasSupabase) return fileToDataUrl(file);

    const safeName = file.name
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-90);
    const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
    const { error } = await client.storage.from("course-assets").upload(filePath, file, {
      cacheControl: "31536000",
      upsert: false
    });

    if (error) {
      toast("تعذر رفع الملف. تأكد من إنشاء bucket باسم course-assets في Supabase Storage.");
      throw error;
    }

    const { data } = client.storage.from("course-assets").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function collectCourseAttachments(form) {
    const pairs = [
      ["explanationFile", "ملف الشرح"],
      ["questionsFile", "ملف الأسئلة"]
    ];
    const attachments = [];
    for (const [fieldName, fallbackLabel] of pairs) {
      const file = form.elements[fieldName]?.files?.[0];
      if (!file) continue;
      attachments.push({
        label: `${fallbackLabel} - ${file.name}`,
        url: await fileToAssetUrl(file, "course-files"),
        type: file.type || "application/octet-stream"
      });
    }
    return attachments;
  }

  async function updateCourseImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const imageUrl = await fileToAssetUrl(file, "course-covers");
    const courseId = input.dataset.courseImage;
    if (hasSupabase) {
      const { error } = await client.from("courses").update({ image_url: imageUrl }).eq("id", courseId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateCourse(courseId, { imageUrl });
    }
    await reload("تم تحديث صورة الكورس.");
  }

  async function editCourse(courseId) {
    const course = state.data.courses.find((item) => item.id === courseId);
    if (!course) return;
    const title = window.prompt("اسم الكورس", course.title);
    if (!title) return;
    const price = window.prompt("السعر", course.price);
    if (price === null) return;
    const description = window.prompt("وصف مختصر", course.description);
    if (description === null) return;
    const patch = { title, price: Number(price || 0), description };
    if (hasSupabase) {
      const { error } = await client.from("courses").update(patch).eq("id", courseId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateCourse(courseId, patch);
    }
    await reload("تم تعديل الكورس.");
  }

  async function toggleCourse(courseId) {
    const course = state.data.courses.find((item) => item.id === courseId);
    if (!course) return;
    const patch = { is_published: course.is_published === false };
    if (hasSupabase) {
      const { error } = await client.from("courses").update(patch).eq("id", courseId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateCourse(courseId, patch);
    }
    await reload(patch.is_published ? "تم نشر الكورس." : "تم إخفاء الكورس.");
  }

  async function deleteCourse(courseId) {
    if (!window.confirm("هل تريد حذف الكورس وكل أقسامه وفيديوهاته؟")) return;
    if (hasSupabase) {
      const { error } = await client.from("courses").delete().eq("id", courseId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.deleteCourse(courseId);
    }
    await reload("تم حذف الكورس.");
  }

  async function editSection(sectionId) {
    const section = state.data.sections.find((item) => item.id === sectionId);
    if (!section) return;
    const title = window.prompt("اسم القسم", section.title);
    if (!title) return;
    const patch = hasSupabase ? { title } : { title };
    if (hasSupabase) {
      const { error } = await client.from("course_sections").update(patch).eq("id", sectionId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateSection(sectionId, patch);
    }
    await reload("تم تعديل القسم.");
  }

  async function deleteSection(sectionId) {
    if (!window.confirm("هل تريد حذف القسم وكل الفيديوهات داخله؟")) return;
    if (hasSupabase) {
      const { error } = await client.from("course_sections").delete().eq("id", sectionId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.deleteSection(sectionId);
    }
    await reload("تم حذف القسم.");
  }

  async function updateSectionImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const imageUrl = await fileToAssetUrl(file, "section-images");
    const sectionId = input.dataset.sectionImage;
    if (hasSupabase) {
      const { error } = await client.from("course_sections").update({ image_url: imageUrl }).eq("id", sectionId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateSection(sectionId, { imageUrl });
    }
    await reload("تم تحديث صورة القسم.");
  }

  async function editLesson(lessonId) {
    const lesson = state.data.lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const title = window.prompt("عنوان الفيديو", lesson.title);
    if (!title) return;
    const videoUrl = window.prompt("رابط الفيديو", lesson.videoUrl);
    if (!videoUrl) return;
    const thumbnailUrl = window.prompt("رابط صورة مصغرة اختياري", lesson.thumbnailUrl || youtubeThumbnail(videoUrl));
    if (thumbnailUrl === null) return;
    const patch = hasSupabase
      ? { title, video_url: videoUrl, thumbnail_url: thumbnailUrl || youtubeThumbnail(videoUrl) }
      : { title, videoUrl, thumbnailUrl: thumbnailUrl || youtubeThumbnail(videoUrl) };
    if (hasSupabase) {
      const { error } = await client.from("lessons").update(patch).eq("id", lessonId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateLesson(lessonId, patch);
    }
    await reload("تم تعديل الفيديو.");
  }

  async function deleteLesson(lessonId) {
    if (!window.confirm("هل تريد حذف هذا الفيديو؟")) return;
    if (hasSupabase) {
      const { error } = await client.from("lessons").delete().eq("id", lessonId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.deleteLesson(lessonId);
    }
    await reload("تم حذف الفيديو.");
  }

  async function updateLessonImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const thumbnailUrl = await fileToAssetUrl(file, "lesson-thumbnails");
    const lessonId = input.dataset.lessonImage;
    if (hasSupabase) {
      const { error } = await client.from("lessons").update({ thumbnail_url: thumbnailUrl }).eq("id", lessonId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateLesson(lessonId, { thumbnailUrl });
    }
    await reload("تم تحديث صورة الفيديو.");
  }

  async function editPost(postId) {
    const post = state.data.posts.find((item) => item.id === postId);
    if (!post) return;
    const title = window.prompt("عنوان المنشور", post.title);
    if (!title) return;
    const body = window.prompt("محتوى المنشور", post.body);
    if (!body) return;
    const patch = { title, body };
    if (hasSupabase) {
      const { error } = await client.from("posts").update(patch).eq("id", postId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updatePost(postId, patch);
    }
    await reload("تم تعديل المنشور.");
  }

  async function togglePost(postId) {
    const post = state.data.posts.find((item) => item.id === postId);
    if (!post) return;
    const patch = { is_published: post.is_published === false };
    if (hasSupabase) {
      const { error } = await client.from("posts").update(patch).eq("id", postId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updatePost(postId, patch);
    }
    await reload(patch.is_published ? "تم نشر المنشور." : "تم إخفاء المنشور.");
  }

  async function deletePost(postId) {
    if (!window.confirm("هل تريد حذف المنشور؟")) return;
    if (hasSupabase) {
      const { error } = await client.from("posts").delete().eq("id", postId);
      if (error) return toast(error.message);
    } else {
      fallbackStore.deletePost(postId);
    }
    await reload("تم حذف المنشور.");
  }

  async function addSupportMessage(form) {
    const values = formValues(form);
    const record = {
      user_id: state.user.id,
      name: values.name,
      email: values.email,
      message: values.message,
      status: "open"
    };
    if (hasSupabase) {
      const { error } = await client.from("support_messages").insert(record);
      if (error) return toast(error.message);
    } else {
      fallbackStore.addSupport(record);
    }
    /* Clear the form */
    form.reset();
    toast("✅ تم إرسال رسالتك بنجاح! سيتم الرد عليك في أقرب وقت.");
    /* Show browser notification if permitted */
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('رسالة دعم جديدة', { body: 'تم إرسال رسالتك بنجاح', icon: './assets/favicon.svg' });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    render();
    loadData().then(() => render());
  }

  async function addLessonComment(lessonId, form) {
    await addComment({ lesson_id: lessonId, body: formValues(form).body });
  }

  async function addPostComment(postId, form) {
    await addComment({ post_id: postId, body: formValues(form).body });
  }

  async function addComment(record) {
    if (!record.body) return;
    const payload = { ...record, user_id: state.user.id };
    if (hasSupabase) {
      const { error } = await client.from("comments").insert(payload);
      if (error) return toast(error.message);
      if (payload.post_id) {
        state.postSocialLoaded = false;
        await loadPostSocials();
        state.postSocialLoaded = true;
      }
      if (payload.lesson_id) {
        await loadLessonComments(payload.lesson_id);
        state.lessonCommentsLoaded.add(payload.lesson_id);
      }
    } else {
      fallbackStore.addComment({
        userId: state.user.id,
        lessonId: payload.lesson_id,
        postId: payload.post_id,
        body: payload.body
      });
    }
    toast("تم إضافة التعليق.");
    render();
  }

  async function buyCourse(courseId) {
    const course = state.data.courses.find((item) => item.id === courseId);
    if (!course) return;
    const whatsappLink = whatsappCourseLink(course);
    window.open(whatsappLink, "_blank", "noopener,noreferrer");
    const current = getEnrollment(courseId);
    if (!current || current.status === "rejected") {
      await saveEnrollment(state.user.id, courseId, "pending", { silent: true });
    }
    await loadData();
    toast("تم فتح واتساب برسالة الشراء الجاهزة.");
    render();
  }

  async function activateFreeCourse(courseId) {
    toast("الكورس مجاني ومتاح لك الآن.");
    navigate("course", courseId);
  }

  async function saveEnrollment(userId, courseId, status, options = {}) {
    const existing = state.data.enrollments.find((item) => {
      return (item.user_id || item.userId) === userId && (item.course_id || item.courseId) === courseId;
    });
    if (hasSupabase) {
      const { error } = await client
        .from("enrollments")
        .upsert({ user_id: userId, course_id: courseId, status }, { onConflict: "user_id,course_id" });
      if (error && !options.silent) return toast(error.message);
    } else if (existing) {
      fallbackStore.updateEnrollment(existing.id, status);
    } else {
      fallbackStore.addEnrollment({ userId, courseId, status });
    }
  }

  async function updateEnrollment(id, status) {
    if (hasSupabase) {
      const { error } = await client.from("enrollments").update({ status }).eq("id", id);
      if (error) return toast(error.message);
    } else {
      fallbackStore.updateEnrollment(id, status);
    }
    await reload("تم تحديث حالة الاشتراك.");
  }

  async function saveManualEnrollment(form) {
    const values = formValues(form);
    await saveEnrollment(values.userId, values.courseId, values.status);
    await reload("تم حفظ تفعيل الكورس للطالب.");
  }

  async function changeAdmin(form, promote) {
    const email = formValues(form).email.toLowerCase();
    const target = state.data.profiles.find((profile) => profile.email.toLowerCase() === email);
    if (!target) return toast("لم يتم العثور على هذا المستخدم.");
    const admins = state.data.profiles.filter((profile) => profile.role === "admin");
    if (!promote && admins.length <= 1 && target.role === "admin") {
      return toast("لا يمكن إزالة آخر حساب مدرس.");
    }
    const role = promote ? "admin" : "student";
    if (hasSupabase) {
      const { error } = await client.from("profiles").update({ role }).eq("id", target.id);
      if (error) return toast(error.message);
    } else {
      fallbackStore.setRole(target.id, role);
    }
    if (target.id === state.profile.id) state.profile.role = role;
    await reload("تم تحديث صلاحيات المستخدم.");
  }

  async function toggleLike(postId) {
    if (!state.user) return;
    const existing = state.data.postLikes.find((like) => (like.post_id || like.postId) === postId && (like.user_id || like.userId) === state.user.id);
    if (existing) {
      /* Optimistic: remove from local state immediately */
      state.data.postLikes = state.data.postLikes.filter((like) => like.id !== existing.id);
      render();
      if (hasSupabase) {
        const { error } = await client.from("post_likes").delete().eq("id", existing.id);
        if (error) { toast(error.message); loadPostSocials().then(() => render()); return; }
      }
    } else {
      /* Optimistic: add to local state immediately */
      const tempLike = { id: 'temp-' + Date.now(), user_id: state.user.id, post_id: postId, created_at: new Date().toISOString() };
      state.data.postLikes.push(tempLike);
      render();
      if (hasSupabase) {
        const { error } = await client.from("post_likes").insert({ user_id: state.user.id, post_id: postId });
        if (error) { toast(error.message); }
      }
    }
    if (hasSupabase) {
      loadPostSocials().then(() => {
        state.postSocialLoaded = true;
        render();
      });
    } else {
      render();
    }
  }

  async function toggleStudentActive(studentId) {
    const student = state.data.profiles.find((profile) => profile.id === studentId);
    if (!student) return;
    const newActive = student.is_active === false ? true : false;
    const confirmMsg = newActive ? "هل تريد تفعيل هذا الحساب؟" : "هل تريد تعطيل هذا الحساب؟ لن يتمكن الطالب من تسجيل الدخول.";
    if (!window.confirm(confirmMsg)) return;
    if (hasSupabase) {
      const { error } = await client.from("profiles").update({ is_active: newActive }).eq("id", studentId);
      if (error) return toast(error.message);
    }
    /* Optimistic update */
    student.is_active = newActive;
    toast(newActive ? "تم تفعيل الحساب." : "تم تعطيل الحساب.");
    render();
    loadData().then(() => render());
  }

  async function reload(message) {
    toast(message);
    render();
    /* Load data in background — don't block the UI */
    loadData().then(() => render());
  }

  function navigate(route, id = null) {
    closeVideoViewer();
    state.route = route;
    state.routeId = id;
    state.search = "";
    /* Save route to URL hash so refresh keeps same page */
    const hash = id ? `${route}/${id}` : route;
    history.replaceState(null, "", `#${hash}`);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeVideoViewer() {
    document.body.classList.remove("video-modal-open");
    document.querySelectorAll(".video-expanded").forEach((node) => node.classList.remove("video-expanded"));
  }

  function filterBySearch(items, keys) {
    const q = state.search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => keys.some((key) => String(item[key] || "").toLowerCase().includes(q)));
  }

  function visibleCourses() {
    return state.data.courses.filter((course) => {
      if (isAdmin()) return true;
      if (course.is_published === false) return false;
      if (state.profile?.grade && course.grade && course.grade !== state.profile.grade && course.grade !== "عام") return false;
      return true;
    });
  }

  function visiblePosts() {
    return state.data.posts.filter((post) => isAdmin() || post.is_published !== false);
  }

  function isAdmin() {
    return state.profile?.role === "admin" || state.profile?.email === "gehanelberawy@gmail.com";
  }

  function canAccessCourse(courseId) {
    const course = state.data.courses.find((item) => item.id === courseId);
    return isAdmin() || Number(course?.price) <= 0 || getEnrollment(courseId)?.status === "active";
  }

  function getEnrollment(courseId) {
    return state.data.enrollments.find((enrollment) => {
      const enrollmentCourseId = enrollment.course_id || enrollment.courseId;
      const enrollmentUserId = enrollment.user_id || enrollment.userId;
      return enrollmentCourseId === courseId && enrollmentUserId === state.user.id;
    });
  }

  function countLessons(courseId) {
    /* Use server-side count (bypasses RLS) if available */
    if (state.data.lessonCounts && state.data.lessonCounts[courseId] !== undefined) {
      return state.data.lessonCounts[courseId];
    }
    /* Fallback: count from locally loaded data */
    const sectionIds = state.data.sections.filter((section) => section.courseId === courseId).map((section) => section.id);
    return state.data.lessons.filter((lesson) => sectionIds.includes(lesson.sectionId)).length;
  }

  function countSections(courseId) {
    return state.data.sections.filter((section) => section.courseId === courseId).length;
  }

  function findProfile(userId) {
    return state.data.profiles.find((profile) => profile.id === userId);
  }

  function statusLabel(status) {
    return { pending: "بانتظار التفعيل", active: "مفعل", rejected: "مرفوض" }[status] || status;
  }

  function priceText(course) {
    return Number(course.price) <= 0 ? "مجاني" : `${course.price} جنيه / الكورس`;
  }

  function studentGrade(profile = state.profile) {
    return profile?.grade || profile?.semester || "";
  }

  function whatsappCourseLink(course) {
    const message = [
      `السلام عليكم چيهان البراوي،`,
      ``,
      `أريد الاشتراك في الكورس التالي:`,
      `• الكورس: ${course.title}`,
      `• السعر: ${priceText(course)}`,
      `• صف الكورس: ${course.grade || 'عام'}`,
      ``,
      `بيانات الطالب:`,
      `• الاسم: ${state.profile.full_name}`,
      `• البريد الإلكتروني: ${state.profile.email}`,
      `• رقم الموبايل: ${state.profile.phone || 'غير مسجل'}`,
      `• الصف: ${studentGrade() || 'غير مسجل'}`,
      `• ID الطالب: ${state.profile.id}`,
      ``,
      `بعد الدفع، برجاء تفعيل الكورس لهذا الحساب.`
    ].join("\n");
    return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function whatsappGeneralLink() {
    const message = `السلام عليكم، أريد التواصل مع منصة چيهان البراوي. الاسم: ${state.profile.full_name}`;
    return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function shareSite() {
    const data = { title: "منصة چيهان البراوي", text: "منصة اللغة العربية", url: location.href };
    if (navigator.share) navigator.share(data);
    else navigator.clipboard.writeText(location.href).then(() => toast("تم نسخ رابط الموقع."));
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function embedUrl(url) {
    if (!url) return "";
    const youtubeId = youtubeIdFromUrl(url);
    if (youtubeId) {
      const params = [
        "controls=0",
        "modestbranding=1",
        "rel=0",
        "showinfo=0",
        "fs=0",
        "iv_load_policy=3",
        "disablekb=1",
        "playsinline=1",
        "cc_load_policy=0",
        "enablejsapi=1",
        `origin=${encodeURIComponent(location.origin)}`
      ].join("&");
      return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
    }
    if (url.includes("vimeo.com/")) {
      const id = url.split("vimeo.com/")[1].split(/[?#]/)[0];
      return `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0`;
    }
    return url;
  }

  function youtubeIdFromUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1).split("/")[0];
      if (parsed.hostname.includes("youtube.com")) {
        if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
        if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/embed/")[1].split("/")[0];
        if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/shorts/")[1].split("/")[0];
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function youtubeThumbnail(url) {
    const id = youtubeIdFromUrl(url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "";
  }

  function bg(url) {
    return url ? `--image:url('${escapeAttr(url)}')` : "";
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(value));
  }

  function empty(message) {
    return `<div class="empty">${message}</div>`;
  }

  function toast(message) {
    const old = document.querySelector(".toast");
    if (old) old.remove();
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function iconSvg(name) {
    const paths = {
      home: `<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>`,
      courses: `<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M8 4v16"/><path d="M11 8h5M11 12h4"/>`,
      posts: `<path d="M5 5h14v14H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>`,
      support: `<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>`,
      students: `<path d="M8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M2.5 21a5.5 5.5 0 0 1 11 0"/><path d="M17 11a3 3 0 1 0 0-6"/><path d="M15.5 15.5A4.5 4.5 0 0 1 21.5 20"/>`,
      more: `<path d="M5 7h14M5 12h14M5 17h14"/>`,
      chevronLeft: `<path d="m15 18-6-6 6-6"/>`,
      chevronRight: `<path d="m9 18 6-6-6-6"/>`
    };
    return `
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          ${paths[name] || paths.more}
        </g>
      </svg>
    `;
  }

  function logoSvg(className) {
    return `<img src="./assets/logo.png" class="${className}" alt="شعار چيهان البراوي" style="width: 100%; height: 100%; max-width: 120px; aspect-ratio: 1/1; object-fit: contain;">`;
  }

  function createFallbackStore() {
    const empty = emptyData();
    return {
      snapshot: () => empty,
      upsertProfile: () => {},
      addCourse: () => "",
      addSection: () => "",
      addLesson: () => {},
      addPost: () => {},
      addSupport: () => {},
      addComment: () => {},
      addEnrollment: () => {},
      updateEnrollment: () => {},
      updateCourse: () => {},
      updateSection: () => {},
      updateLesson: () => {},
      deleteCourse: () => {},
      deleteSection: () => {},
      deleteLesson: () => {},
      updatePost: () => {},
      deletePost: () => {},
      setRole: () => {}
    };
  }

  /* ══════════════════════════════════════════════
     THEME TOGGLE (Dark / Light)
     ══════════════════════════════════════════════ */

  function renderThemeToggle(isFixed = false) {
    const isDark = document.body.classList.contains("dark");
    const style = isFixed ? 'style="position: fixed; top: 16px; left: 16px; z-index: 15;"' : '';
    return `<button class="theme-toggle" data-theme-toggle title="${isDark ? 'الوضع الفاتح' : 'الوضع الداكن'}" ${style}>${isDark ? '☀️' : '🌙'}</button>`;
  }

  function bindThemeToggle() {
    const btns = document.querySelectorAll("[data-theme-toggle]");
    btns.forEach(btn => btn.addEventListener("click", toggleTheme));
  }

  function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    /* Re-render to update toggle icon */
    render();
  }

  function restoreTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      document.body.classList.add("dark");
    } else if (saved === "light") {
      document.body.classList.remove("dark");
    }
  }

  /* ══════════════════════════════════════════════
     ANTI-THEFT & SECURITY
     ══════════════════════════════════════════════ */
  (function initSecurity() {
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault(); return false;
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j" || e.key === "C" || e.key === "c")) {
        e.preventDefault(); return false;
      }
      if (e.ctrlKey && (e.key === "U" || e.key === "u" || e.key === "S" || e.key === "s" || e.key === "P" || e.key === "p")) {
        e.preventDefault(); return false;
      }
    });

    setInterval(() => {
      const before = new Date().getTime();
      debugger;
      const after = new Date().getTime();
      if (after - before > 100) {
        document.body.innerHTML = "<h1 style='text-align:center; padding:50px; direction:rtl;'>غير مسموح بفتح أدوات المطورين ⛔</h1>";
      }
    }, 2000);
  })();

})();
