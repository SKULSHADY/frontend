import { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import { computeDomain } from "../../../common/entity/compute_domain";
import { HomeAssistant } from "../../../types";
import { LovelaceCardFeature, LovelaceCardFeatureEditor } from "../types";
import { MediaControlsCardFeatureConfig } from "./types";
import { isUnavailableState } from "../../../data/entity";
import "../../../components/ha-control-button";
import "../../../components/ha-control-button-group";
import "../../../components/ha-svg-icon";
import { supportsFeature } from "../../../common/entity/supports-feature";
import {
  computeMediaControls,
  handleMediaControlClick,
  MediaPlayerEntity,
  MediaPlayerEntityFeature,
} from "../../../data/media-player";

export const REPEAT_MODES = ["off", "all", "one"] as const;

export const supportsMediaControlsCardFeature = (stateObj: HassEntity) => {
  const domain = computeDomain(stateObj.entity_id);
  return domain === "media_player";
};

@customElement("hui-media-controls-card-feature")
class HuiMediaControlsCardFeature
  extends LitElement
  implements LovelaceCardFeature
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: MediaPlayerEntity;

  @state() private _config?: MediaControlsCardFeatureConfig;

  @state() _currentState?: string;

  static getStubConfig(): MediaControlsCardFeatureConfig {
    return {
      type: "media-controls",
      use_extended_controls: false,
    };
  }

  public static async getConfigElement(): Promise<LovelaceCardFeatureEditor> {
    await import(
      "../editor/config-elements/hui-media-controls-card-feature-editor"
    );
    return document.createElement("hui-media-controls-card-feature-editor");
  }

  public setConfig(config: MediaControlsCardFeatureConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;
  }

  protected willUpdate(changedProp: PropertyValues): void {
    super.willUpdate(changedProp);
    if (changedProp.has("stateObj") && this.stateObj) {
      this._currentState = this.stateObj.state;
    }
  }

  private _handleClick(e: MouseEvent): void {
    handleMediaControlClick(
      this.hass!,
      this.stateObj!,
      (e.currentTarget as HTMLElement).getAttribute("action")!
    );
  }

  private async _toggleMute() {
    const stateObj = this.stateObj!;

    await this.hass!.callService("media_player", "volume_mute", {
      entity_id: stateObj.entity_id,
      is_volume_muted: !stateObj.attributes.is_volume_muted,
    });
  }

  protected render() {
    if (
      !this._config ||
      !this.hass ||
      !this.stateObj ||
      !supportsMediaControlsCardFeature(this.stateObj)
    ) {
      return nothing;
    }

    const stateObj = this.stateObj;

    const mediaControls = computeMediaControls(
      stateObj,
      this._config.use_extended_controls
    );
    if (!mediaControls) {
      return nothing;
    }

    return html`
      <div class="container">
        <ha-control-button-group>
          ${mediaControls.map(
            (control) => html`
              <ha-control-button
                action=${control.action}
                @click=${this._handleClick}
                title=${this.hass!.localize(
                  `ui.card.media_player.${control.action}`
                )}
              >
                <ha-svg-icon .path=${control.icon}></ha-svg-icon>
              </ha-control-button>
            `
          )}
          ${supportsFeature(stateObj, MediaPlayerEntityFeature.VOLUME_MUTE)
            ? html`<ha-control-button
                @click=${this._toggleMute}
                .disabled=${isUnavailableState(stateObj.state)}
              >
                <ha-icon
                  icon=${stateObj.attributes.is_volume_muted
                    ? "mdi:volume-off"
                    : "mdi:volume-high"}
                ></ha-icon>
              </ha-control-button>`
            : nothing}
        </ha-control-button-group>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-control-button {
        width: 100%;
      }
      .container {
        width: auto;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-media-controls-card-feature": HuiMediaControlsCardFeature;
  }
}
