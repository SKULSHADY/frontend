import { mdiFanAuto, mdiFanSpeed1, mdiFanSpeed2, mdiFanSpeed3 } from "@mdi/js";
import { HassEntity } from "home-assistant-js-websocket";
import { html, LitElement, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { UNIT_F } from "../../../common/const";
import { computeDomain } from "../../../common/entity/compute_domain";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { stateColorCss } from "../../../common/entity/state_color";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { debounce } from "../../../common/util/debounce";
import "../../../components/ha-control-button-group";
import "../../../components/ha-control-number-buttons";
import {
  ClimateEntity,
  ClimateEntityFeature,
  climateHvacModeIcon,
} from "../../../data/climate";
import { UNAVAILABLE } from "../../../data/entity";
import { HomeAssistant } from "../../../types";
import { LovelaceCardFeature, LovelaceCardFeatureEditor } from "../types";
import { cardFeatureStyles } from "./common/card-feature-styles";
import { filterModes } from "./common/filter-modes";
import { ClimateControlsCardFeatureConfig } from "./types";

type Target = "value" | "low" | "high";

export const supportsClimateControlsCardFeature = (stateObj: HassEntity) => {
  const domain = computeDomain(stateObj.entity_id);
  return (
    domain === "climate" &&
    (supportsFeature(stateObj, ClimateEntityFeature.TARGET_TEMPERATURE) ||
      supportsFeature(stateObj, ClimateEntityFeature.TARGET_TEMPERATURE_RANGE))
  );
};

@customElement("hui-climate-controls-card-feature")
class HuiClimateControlsCardFeature
  extends LitElement
  implements LovelaceCardFeature
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: ClimateEntity;

  @state() private _config?: ClimateControlsCardFeatureConfig;

  @state() private _targetTemperature: Partial<Record<Target, number>> = {};

  @state() private _fanMode: number = 0;

  _fanModes = ["auto", "low", "medium", "high"];

  _fanIcons = [mdiFanAuto, mdiFanSpeed1, mdiFanSpeed2, mdiFanSpeed3];

  @state() private _hvacMode: number = 0;

  _hvacModes = ["auto", "heat_cool", "heat", "cool", "dry", "fan_only", "off"];

  static getStubConfig(): ClimateControlsCardFeatureConfig {
    return {
      type: "climate-controls",
      show_hvac_modes: false,
    };
  }

  public static async getConfigElement(): Promise<LovelaceCardFeatureEditor> {
    await import(
      "../editor/config-elements/hui-climate-controls-card-feature-editor"
    );
    return document.createElement("hui-climate-controls-card-feature-editor");
  }

  public setConfig(config: ClimateControlsCardFeatureConfig): void {
    if (!config) {
      throw new Error("Invalid configuration");
    }
    this._config = config;

    this._hvacModes = filterModes(this._hvacModes, this._config.hvac_modes);
  }

  protected willUpdate(changedProp: PropertyValues): void {
    super.willUpdate(changedProp);
    if (changedProp.has("stateObj")) {
      this._targetTemperature = {
        value: this.stateObj!.attributes.temperature,
        low:
          "target_temp_low" in this.stateObj!.attributes
            ? this.stateObj!.attributes.target_temp_low
            : undefined,
        high:
          "target_temp_high" in this.stateObj!.attributes
            ? this.stateObj!.attributes.target_temp_high
            : undefined,
      };
      this._fanMode = this._fanModes.indexOf(
        this.stateObj!.attributes.fan_mode?.toString() ?? "auto"
      );
      this._hvacMode = this._hvacModes.indexOf(
        this.stateObj!.state?.toString() ?? "off"
      );
    }
  }

  private _onFanTap(ev: CustomEvent): void {
    ev.stopPropagation();
    this._fanMode += 1;
    if (this._fanMode > 3) this._fanMode = 0;
    this.hass!.callService("climate", "set_fan_mode", {
      entity_id: this.stateObj!.entity_id,
      fan_mode: this._fanModes[this._fanMode],
    });
  }

  private _onHvacTap(ev: CustomEvent): void {
    ev.stopPropagation();
    this._hvacMode += 1;
    if (this._hvacMode > this._hvacModes.length - 1) this._hvacMode = 0;
    this.hass!.callService("climate", "set_hvac_mode", {
      entity_id: this.stateObj!.entity_id,
      hvac_mode: this._hvacModes[this._hvacMode],
    });
  }

  private get _step() {
    return (
      this.stateObj!.attributes.target_temp_step ||
      (this.hass!.config.unit_system.temperature === UNIT_F ? 1 : 0.5)
    );
  }

  private get _min() {
    return this.stateObj!.attributes.min_temp;
  }

  private get _max() {
    return this.stateObj!.attributes.max_temp;
  }

  private async _valueChanged(ev: CustomEvent) {
    const value = (ev.detail as any).value;
    if (isNaN(value)) return;
    const target = (ev.currentTarget as any).target ?? "value";

    this._targetTemperature = {
      ...this._targetTemperature,
      [target]: value,
    };
    this._debouncedCallService(target);
  }

  private _debouncedCallService = debounce(
    (target: Target) => this._callService(target),
    1000
  );

  private _callService(type: string) {
    const domain = computeStateDomain(this.stateObj!);
    if (type === "high" || type === "low") {
      this.hass!.callService(domain, "set_temperature", {
        entity_id: this.stateObj!.entity_id,
        target_temp_low: this._targetTemperature.low,
        target_temp_high: this._targetTemperature.high,
      });
      return;
    }
    this.hass!.callService(domain, "set_temperature", {
      entity_id: this.stateObj!.entity_id,
      temperature: this._targetTemperature.value,
    });
  }

  private _supportsTarget() {
    const domain = computeStateDomain(this.stateObj!);
    return (
      domain === "climate" &&
      supportsFeature(this.stateObj!, ClimateEntityFeature.TARGET_TEMPERATURE)
    );
  }

  private _supportsTargetRange() {
    const domain = computeStateDomain(this.stateObj!);
    return (
      domain === "climate" &&
      supportsFeature(
        this.stateObj!,
        ClimateEntityFeature.TARGET_TEMPERATURE_RANGE
      )
    );
  }

  protected render() {
    if (
      !this._config ||
      !this.hass ||
      !this.stateObj ||
      !supportsClimateControlsCardFeature(this.stateObj)
    ) {
      return nothing;
    }

    const isOff = this.stateObj.state === "off";
    const iconColor = isOff
      ? "var(--primary-text-color)"
      : "var(--disabled-color)";
    const stateColor = isOff
      ? "var(--disabled-color)"
      : stateColorCss(this.stateObj);
    const rippleColor = isOff
      ? "var(--secondary-text-color)"
      : stateColorCss(this.stateObj);
    const buttonOpacity = isOff ? 0.2 : 1;
    const rippleOpacity = isOff ? 0.04 : 0.12;
    const digits = this._step.toString().split(".")?.[1]?.length ?? 0;

    const options = {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    };

    if (
      this._supportsTarget() &&
      this._targetTemperature.value != null &&
      this.stateObj.state !== UNAVAILABLE
    ) {
      if (this._config.show_hvac_modes) {
        return html`
          <ha-control-button-group>
            <ha-control-button
              @click=${this._onHvacTap}
              class="hvac-mode"
              style=${styleMap({
                "--control-button-icon-color": iconColor,
                "--control-button-background-color": stateColor,
                "--control-button-background-opacity": buttonOpacity,
                "--ha-ripple-color": rippleColor,
                "min-width": "40px",
                width: "100%",
              })}
            >
              <ha-svg-icon
                .path=${climateHvacModeIcon(this.stateObj.state ?? "off")}
              ></ha-svg-icon>
            </ha-control-button>
            <ha-control-number-buttons
              .formatOptions=${options}
              .target=${"value"}
              .value=${this.stateObj.attributes.temperature}
              .unit=${this.hass.config.unit_system.temperature}
              .min=${this._min}
              .max=${this._max}
              .step=${this._step}
              @value-changed=${this._valueChanged}
              .label=${this.hass.formatEntityAttributeName(
                this.stateObj,
                "temperature"
              )}
              style=${styleMap({
                "--control-number-buttons-focus-color": rippleColor,
                width: "calc(16px + 200%)",
              })}
              .disabled=${this.stateObj!.state === UNAVAILABLE}
              .locale=${this.hass.locale}
            >
            </ha-control-number-buttons>
            <ha-control-button
              @click=${this._onFanTap}
              style=${styleMap({
                "--ha-ripple-hover-opacity": rippleOpacity,
                "--ha-ripple-color": rippleColor,
                "min-width": "40px",
                width: "100%",
              })}
            >
              <ha-svg-icon .path=${this._fanIcons[this._fanMode]}></ha-svg-icon>
            </ha-control-button>
          </ha-control-button-group>
        `;
      }
      return html`
        <ha-control-button-group>
          <ha-control-number-buttons
            .formatOptions=${options}
            .target=${"value"}
            .value=${this.stateObj.attributes.temperature}
            .unit=${this.hass.config.unit_system.temperature}
            .min=${this._min}
            .max=${this._max}
            .step=${this._step}
            @value-changed=${this._valueChanged}
            .label=${this.hass.formatEntityAttributeName(
              this.stateObj,
              "temperature"
            )}
            style=${styleMap({
              "--control-number-buttons-focus-color": stateColor,
              width: "186%",
            })}
            .disabled=${this.stateObj!.state === UNAVAILABLE}
            .locale=${this.hass.locale}
          >
          </ha-control-number-buttons>
          <ha-control-button
            @click=${this._onFanTap}
            style=${styleMap({
              "min-width": "40px",
              width: "100%",
            })}
          >
            <ha-svg-icon .path=${this._fanIcons[this._fanMode]}></ha-svg-icon>
          </ha-control-button>
        </ha-control-button-group>
      `;
    }

    return html`
      <ha-control-button-group>
        <ha-control-number-buttons
          .disabled=${this.stateObj!.state === UNAVAILABLE}
          .unit=${this.hass.config.unit_system.temperature}
          .label=${this.hass.formatEntityAttributeName(
            this.stateObj,
            "temperature"
          )}
          style=${styleMap({
            "--control-number-buttons-focus-color": stateColor,
          })}
          .locale=${this.hass.locale}
        >
        </ha-control-number-buttons>
      </ha-control-button-group>
    `;
  }

  static get styles() {
    return cardFeatureStyles;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-climate-controls-card-feature": HuiClimateControlsCardFeature;
  }
}
