import { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import { computeDomain } from "../../../common/entity/compute_domain";
import { isOffState, isUnavailableState } from "../../../data/entity";
import { HomeAssistant } from "../../../types";
import { LovelaceCardFeature, LovelaceCardFeatureEditor } from "../types";
import { MediaVolumeCardFeatureConfig } from "./types";
import "../../../components/ha-control-button";
import "../../../components/ha-control-button-group";
import "../../../components/ha-control-number-buttons";
import "../../../components/ha-control-slider";
import "../../../components/ha-icon";
import { supportsFeature } from "../../../common/entity/supports-feature";
import {
  MediaPlayerEntity,
  MediaPlayerEntityFeature,
} from "../../../data/media-player";

export const supportsMediaVolumeCardFeature = (stateObj: HassEntity) => {
  const domain = computeDomain(stateObj.entity_id);
  return (
    domain === "media_player" &&
    supportsFeature(stateObj, MediaPlayerEntityFeature.VOLUME_SET)
  );
};

@customElement("hui-media-volume-card-feature")
class HuiMediaVolumeCardFeature
  extends LitElement
  implements LovelaceCardFeature
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: MediaPlayerEntity;

  @state() private _config?: MediaVolumeCardFeatureConfig;

  @state() _currentState?: string;

  static getStubConfig(): MediaVolumeCardFeatureConfig {
    return {
      type: "media-volume",
      style: "slider",
    };
  }

  public static async getConfigElement(): Promise<LovelaceCardFeatureEditor> {
    await import(
      "../editor/config-elements/hui-media-volume-card-feature-editor"
    );
    return document.createElement("hui-media-volume-card-feature-editor");
  }

  public setConfig(config: MediaVolumeCardFeatureConfig): void {
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

  private async _toggleMute() {
    const stateObj = this.stateObj!;

    await this.hass!.callService("media_player", "volume_mute", {
      entity_id: stateObj.entity_id,
      is_volume_muted: !stateObj.attributes.is_volume_muted,
    });
  }

  private async _setVolume(ev: CustomEvent) {
    const stateObj = this.stateObj!;

    await this.hass!.callService("media_player", "volume_set", {
      entity_id: stateObj.entity_id,
      volume_level: ev.detail.value / 100,
    });
  }

  protected render() {
    if (
      !this._config ||
      !this.hass ||
      !this.stateObj ||
      !supportsMediaVolumeCardFeature(this.stateObj)
    ) {
      return nothing;
    }

    const stateObj = this.stateObj;

    if (isOffState(stateObj.state)) {
      return nothing;
    }

    return html`
      <div class="container">
        <ha-control-button-group>
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
          ${supportsFeature(stateObj, MediaPlayerEntityFeature.VOLUME_SET)
            ? this._config.style === "buttons"
              ? html`<ha-control-number-buttons
                  value=${stateObj.attributes.volume_level! * 100}
                  min="0"
                  max="100"
                  @value-changed=${this._setVolume}
                  .disabled=${isUnavailableState(stateObj.state)}
                ></ha-control-number-buttons>`
              : html`<ha-control-slider
                  value=${stateObj.attributes.volume_level! * 100}
                  min="0"
                  max="100"
                  @value-changed=${this._setVolume}
                  .disabled=${isUnavailableState(stateObj.state)}
                  >test
                </ha-control-slider>`
            : nothing}
        </ha-control-button-group>
      </div>
    `;
  }

  static get styles() {
    return css`
      ha-control-button {
        --control-button-background-color: var(--card-color);
        width: 100%;
      }
      ha-control-slider {
        --control-slider-color: var(--card-color);
      }
      .container {
        padding: 0 12px 12px 12px;
        width: auto;
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-media-volume-card-feature": HuiMediaVolumeCardFeature;
  }
}