import { consume } from "@lit-labs/context";
import {
  HassConfig,
  HassEntities,
  HassEntity,
} from "home-assistant-js-websocket";
import {
  CSSResultGroup,
  LitElement,
  PropertyValues,
  css,
  html,
  nothing,
} from "lit";
import { customElement, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { DOMAINS_TOGGLE } from "../../../common/const";
import { transform } from "../../../common/decorators/transform";
import { applyThemesOnElement } from "../../../common/dom/apply_themes_on_element";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeCssColor } from "../../../common/color/compute-color";
import { hsv2rgb, rgb2hex, rgb2hsv } from "../../../common/color/convert-color";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { stateActive } from "../../../common/entity/state_active";
import {
  stateColorBrightness,
  stateColorCss,
} from "../../../common/entity/state_color";
import { isValidEntityId } from "../../../common/entity/valid_entity_id";
import { iconColorCSS } from "../../../common/style/icon_color_css";
import { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-card";
import "../../../components/ha-ripple";
import "../../../components/tile/ha-tile-icon";
import { CLIMATE_HVAC_ACTION_TO_MODE } from "../../../data/climate";
import {
  configContext,
  entitiesContext,
  localeContext,
  localizeContext,
  statesContext,
  themesContext,
} from "../../../data/context";
import { EntityRegistryDisplayEntry } from "../../../data/entity_registry";
import { ActionHandlerEvent } from "../../../data/lovelace/action_handler";
import { FrontendLocaleData } from "../../../data/translation";
import { Themes } from "../../../data/ws-themes";
import { HomeAssistant } from "../../../types";
import { actionHandler } from "../common/directives/action-handler-directive";
import { findEntities } from "../common/find-entities";
import { hasAction } from "../common/has-action";
import { createEntityNotFoundWarning } from "../components/hui-warning";
import {
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceLayoutOptions,
} from "../types";
import { ButtonCardConfig } from "./types";

export const getEntityDefaultButtonAction = (entityId?: string) =>
  entityId && DOMAINS_TOGGLE.has(computeDomain(entityId))
    ? "toggle"
    : "more-info";

@customElement("hui-button-card")
export class HuiButtonCard extends LitElement implements LovelaceCard {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import("../editor/config-elements/hui-button-card-editor");
    return document.createElement("hui-button-card-editor");
  }

  public static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[]
  ): ButtonCardConfig {
    const maxEntities = 1;
    const foundEntities = findEntities(
      hass,
      maxEntities,
      entities,
      entitiesFallback,
      ["light", "switch"]
    );

    return {
      type: "button",
      tap_action: {
        action: "toggle",
      },
      entity: foundEntities[0] || "",
    };
  }

  public hass!: HomeAssistant;

  @state() private _config?: ButtonCardConfig;

  @consume<any>({ context: statesContext, subscribe: true })
  @transform({
    transformer: function (this: HuiButtonCard, value: HassEntities) {
      return this._config?.entity ? value[this._config?.entity] : undefined;
    },
    watch: ["_config"],
  })
  _stateObj?: HassEntity;

  @state()
  @consume({ context: themesContext, subscribe: true })
  _themes!: Themes;

  @state()
  @consume({ context: localizeContext, subscribe: true })
  _localize!: LocalizeFunc;

  @state()
  @consume({ context: localeContext, subscribe: true })
  _locale!: FrontendLocaleData;

  @state()
  @consume({ context: configContext, subscribe: true })
  _hassConfig!: HassConfig;

  @consume<any>({ context: entitiesContext, subscribe: true })
  @transform<HomeAssistant["entities"], EntityRegistryDisplayEntry>({
    transformer: function (this: HuiButtonCard, value) {
      return this._config?.entity ? value[this._config?.entity] : undefined;
    },
    watch: ["_config"],
  })
  _entity?: EntityRegistryDisplayEntry;

  private getStateColor(stateObj: HassEntity, config: ButtonCardConfig) {
    const domain = stateObj ? computeStateDomain(stateObj) : undefined;
    return config && (config.state_color ?? domain === "light");
  }

  public getCardSize(): number {
    return (
      (this._config?.show_icon ? 4 : 0) + (this._config?.show_name ? 1 : 0)
    );
  }

  public getLayoutOptions(): LovelaceLayoutOptions {
    if (
      this._config?.show_icon &&
      (this._config?.show_name || this._config?.show_state)
    ) {
      return {
        grid_rows: 2,
        grid_columns: 2,
        grid_min_rows: 2,
      };
    }
    return {
      grid_rows: 1,
      grid_columns: 1,
    };
  }

  public setConfig(config: ButtonCardConfig): void {
    if (config.entity && !isValidEntityId(config.entity)) {
      throw new Error("Invalid entity");
    }

    this._config = {
      tap_action: {
        action: getEntityDefaultButtonAction(config.entity),
      },
      hold_action: { action: "more-info" },
      show_icon: true,
      show_name: true,
      ...config,
    };
  }

  protected render() {
    if (!this._config || !this._localize || !this._locale) {
      return nothing;
    }
    const stateObj = this._stateObj;

    if (this._config.entity && !stateObj) {
      return html`
        <hui-warning>
          ${createEntityNotFoundWarning(this.hass, this._config.entity)}
        </hui-warning>
      `;
    }

    const name = this._config.show_name
      ? this._config.name || (stateObj ? computeStateName(stateObj) : "")
      : "";

    const colored = stateObj && this.getStateColor(stateObj, this._config);

    const color = stateObj
      ? this._computeStateColor(stateObj, this._config.color)
      : "var(--primary-color)";

    const style = {
      "--color": color,
      "--state-color": color,
    };

    return html`
      <ha-card
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this._config!.hold_action),
          hasDoubleClick: hasAction(this._config!.double_tap_action),
        })}
        role="button"
        aria-label=${this._config.name ||
        (stateObj ? computeStateName(stateObj) : "")}
        tabindex=${ifDefined(
          hasAction(this._config.tap_action) ? "0" : undefined
        )}
        style=${styleMap(style)}
      >
        <ha-ripple></ha-ripple>
        ${this._config.show_icon
          ? html`
              <ha-tile-icon>
                <ha-state-icon
                  tabindex="-1"
                  data-domain=${ifDefined(
                    stateObj ? computeStateDomain(stateObj) : undefined
                  )}
                  data-state=${ifDefined(stateObj?.state)}
                  .icon=${this._config.icon}
                  .hass=${this.hass}
                  .stateObj=${stateObj}
                  style=${styleMap({
                    filter: colored
                      ? stateColorBrightness(stateObj)
                      : undefined,
                    height: this._config.icon_height
                      ? this._config.icon_height
                      : "",
                    width: this._config.icon_height
                      ? this._config.icon_height
                      : "",
                  })}
                ></ha-state-icon>
              </ha-tile-icon>
            `
          : ""}
        ${this._config.show_name
          ? html`<span tabindex="-1" .title=${name}>${name}</span>`
          : ""}
        ${this._config.show_state && stateObj
          ? html`<span class="state">
              ${this.hass.formatEntityState(stateObj)}
            </span>`
          : ""}
      </ha-card>
    `;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this._themes) {
      return;
    }
    if (!changedProps.has("_themes") && !changedProps.has("_config")) {
      return;
    }
    const oldThemes = changedProps.get("_themes") as
      | HomeAssistant["themes"]
      | undefined;
    const oldConfig = changedProps.get("_config") as
      | ButtonCardConfig
      | undefined;

    if (
      (changedProps.has("_themes") &&
        (!oldThemes || oldThemes !== this._themes)) ||
      (changedProps.has("_config") &&
        (!oldConfig || oldConfig.theme !== this._config.theme))
    ) {
      applyThemesOnElement(this, this._themes, this._config.theme);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      iconColorCSS,
      css`
        :host {
          -webkit-tap-highlight-color: transparent;
        }
        ha-card {
          --state-inactive-color: initial;
          --state-color: var(--paper-item-icon-color, #44739e);
          --ha-ripple-color: var(--state-color);
          --ha-ripple-hover-opacity: 0.04;
          --ha-ripple-pressed-opacity: 0.12;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 12px;
          font-size: 14px;
          font-weight: 500;
          line-height: 20px;
          height: 100%;
          box-sizing: border-box;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        ha-card:focus {
          outline: none;
        }

        ha-tile-icon {
          --tile-icon-color: var(--color);
        }

        ha-state-icon {
          width: 40%;
          height: auto;
          max-height: 80%;
          color: var(--color);
          --mdc-icon-size: 100%;
          transition: transform 180ms ease-in-out;
          pointer-events: none;
          outline: none;
        }

        ha-state-icon + span {
          margin-top: 8px;
        }

        span {
          margin-top: 8px;
          outline: none;
        }

        ha-card:focus-visible {
          --shadow-default: var(--ha-card-box-shadow, 0 0 0 0 transparent);
          --shadow-focus: 0 0 0 1px
            var(--state-color, var(--paper-item-icon-color, #44739e));
          border-color: var(
            --state-color,
            var(--paper-item-icon-color, #44739e)
          );
          box-shadow: var(--shadow-default), var(--shadow-focus);
        }

        ha-card:focus-visible ha-state-icon,
        :host(:active) ha-state-icon {
          transform: scale(1.2);
        }

        .state {
          font-size: 0.9rem;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }

  private _computeStateColor = memoizeOne(
    (entity: HassEntity, color?: string) => {
      if (!color || color === "none") {
        return undefined;
      }

      if (color === "state") {
        // Use light color if the light support rgb
        if (
          computeDomain(entity.entity_id) === "light" &&
          entity.attributes.rgb_color
        ) {
          const hsvColor = rgb2hsv(entity.attributes.rgb_color);

          // Modify the real rgb color for better contrast
          if (hsvColor[1] < 0.4) {
            // Special case for very light color (e.g: white)
            if (hsvColor[1] < 0.1) {
              hsvColor[2] = 225;
            } else {
              hsvColor[1] = 0.4;
            }
          }
          return rgb2hex(hsv2rgb(hsvColor));
        }
        // Fallback to state color
        return stateColorCss(entity);
      }

      if (color) {
        // Use custom color if active
        return stateActive(entity) ? computeCssColor(color) : undefined;
      }
      return color;
    }
  );

  private _handleAction(ev: ActionHandlerEvent) {
    fireEvent(this, "hass-action", {
      config: this._config!,
      action: ev.detail.action,
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-button-card": HuiButtonCard;
  }
}
