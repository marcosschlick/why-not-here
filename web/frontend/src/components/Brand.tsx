import { useI18n } from "../i18n";

export function Brand() {
  const { t } = useI18n();
  return (
    <div className="topbar-brand">
      <h1 className="brand-logo-frame">
        <img
          src="/logo.svg"
          alt="Why Not Here?"
          className="brand-logo-img"
          width="1000"
          height="256"
        />
      </h1>
      <div className="brand-text">
        <span className="brand-tagline">
          {t(
            "Contrastive explanations for autonomous path planning via Inverse Shortest Path (ISP) on 2D grids",
          )}
        </span>
      </div>
    </div>
  );
}
