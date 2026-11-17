import { useEffect } from "react";

const SITE = "https://taskflow.aiuohall.dev";

function setMeta(selector, create, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Per-route title, description, canonical URL and robots directive.
 * Googlebot renders JavaScript, so updating the head client-side is indexed.
 * Pass noindex for screens behind login or with no search value.
 */
export default function Seo({ title, description, path = "/", noindex = false }) {
  useEffect(() => {
    document.title = title;
    const desc = setMeta('meta[name="description"]', () => {
      const m = document.createElement("meta");
      m.name = "description";
      return m;
    });
    if (description) desc.content = description;

    const canon = setMeta('link[rel="canonical"]', () => {
      const l = document.createElement("link");
      l.rel = "canonical";
      return l;
    });
    canon.href = SITE + path;

    const robots = setMeta('meta[name="robots"]', () => {
      const m = document.createElement("meta");
      m.name = "robots";
      return m;
    });
    robots.content = noindex
      ? "noindex, nofollow"
      : "index, follow, max-image-preview:large, max-snippet:-1";
  }, [title, description, path, noindex]);

  return null;
}
