import type { ReactNode } from "react";

/** 1200×628 stage for the og:video renders (captured frame by frame). */
export const OG_CSS = `
#ogv{position:relative;width:1200px;height:628px;overflow:hidden;background:#0A0806;color:#EDE7DE;font-family:'DM Sans',system-ui,sans-serif}
#ogv .sf{font-family:'Source Serif 4','Newsreader',Georgia,serif}
#ogv .r{color:#E0493A}#ogv .m{color:#8C8479}
#ogv .sc{position:absolute;inset:0}
#ogv .k{font-size:19px;letter-spacing:.22em;color:#8C8479;text-transform:uppercase}
@keyframes ogpulse{0%,100%{box-shadow:0 0 0 0 rgba(224,73,58,.7)}60%{box-shadow:0 0 0 22px rgba(224,73,58,0)}}
@keyframes ogwv{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}
@keyframes ogprog{0%{width:0}100%{width:100%}}
`;

export function OgFrame({ css, children }: { css: string; children: ReactNode }) {
  return (
    <>
      <style>{OG_CSS + css}</style>
      <div id="ogv">{children}</div>
    </>
  );
}

/** The cheetah mark's geometry (lib/cheetah-mark), as stripes + silhouette. */
export const STRIPES = [22, 33, 44, 55, 66, 77, 88];
export const CHEETAH_BODY = "M176 66 L204 86 L214 94 L211 97 L200 91 L168 72 Z M92 62 L66 92 L50 99 L49 95 L60 89 L80 60 Z M8 46 C28 50 46 46 62 42 C90 34 120 42 150 40 C162 38 170 34 180 36 C190 36 198 34 204 32 L206 25 L212 31 C217 30 224 35 228 41 L229 45 C224 48 217 49 211 49 C204 52 196 56 190 60 C200 62 214 66 226 70 L238 72 L238 76 L224 75 C210 73 196 72 184 70 C178 80 162 80 150 70 C136 62 124 58 108 58 C96 60 88 64 84 68 L50 84 L22 92 L18 89 L44 80 L70 62 C66 56 64 52 62 50 C46 52 26 55 8 50 Z";
export const CHEETAH_EYE = "M204 32 L206 25 L212 31 C217 30 224 35 228 41 L229 45 C224 48 217 49 211 49 L204 44 Z";
