import { useParams } from "react-router-dom";
import { MunicipalityProvider } from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70OperationalMap } from "./V70OperationalMap";

export function V70DirectMap0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return <MunicipalityProvider consumer={consumer}>
    <V70DirectShell0509
      active="mapa"
      eyebrow="TERRITORIO Y OPERACIÓN"
      topbarTitle={municipalityTitle}
      accountRole="Dirección de campaña"
    >
      <V70OperationalMap />
    </V70DirectShell0509>
  </MunicipalityProvider>;
}
