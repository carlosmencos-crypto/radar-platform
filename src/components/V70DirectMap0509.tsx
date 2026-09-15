import { Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider } from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70OperationalMap } from "./V70OperationalMap";

export function V70DirectMap0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509") return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}>
    <V70DirectShell0509
      active="mapa"
      eyebrow="TERRITORIO Y OPERACIÓN"
      topbarTitle="San José / Puerto San José · Escuintla"
      accountRole="Dirección de campaña"
    >
      <V70OperationalMap />
    </V70DirectShell0509>
  </MunicipalityProvider>;
}
