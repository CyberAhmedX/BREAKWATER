import type { Ticket } from "../engine/types";
import { clinicVpnEvents, hwAlertEvents, schoolDnsLog } from "./logs";
import { socSprayTicket, guestWifi, guestWifiTicket, mfaFatigue, mfaFatigueTicket, usbCase, usbTicket, externalTest, externalTestTicket, leakSite, leakSiteTicket } from "./tracks";
import { schoolDnsTicket } from "./tickets";
import { socTemptTicket } from "./teamcases4";
import { provedShut, provedShutTicket, nameMoves, nameMovesTicket } from "./finales";

// Cases that are built fresh for each run. Each builder takes the run's seed
// and returns the whole case: the evidence on screen, the right answers and
// the explanations, all from one draw, so they can never disagree.
const BUILDERS: Record<string, (seed: number) => Ticket> = {
  tr_soc: (seed) => socSprayTicket(clinicVpnEvents(seed)),
  t2_school_dns: (seed) => schoolDnsTicket(schoolDnsLog(seed)),
  tr_network: (seed) => guestWifiTicket(guestWifi(seed)),
  tr_helpdesk: (seed) => mfaFatigueTicket(mfaFatigue(seed)),
  tr_forensics: (seed) => usbTicket(usbCase(seed)),
  tr_pentest: (seed) => externalTestTicket(externalTest(seed)),
  tr_intel: (seed) => leakSiteTicket(leakSite(seed)),
  t4_soc: (seed) => socTemptTicket(hwAlertEvents(seed)),
  t5_pentest: (seed) => provedShutTicket(provedShut(seed)),
  t5_intel: (seed) => nameMovesTicket(nameMoves(seed)),
};

/** The ids of every case that changes between runs. */
export const VARYING_CASES: readonly string[] = Object.keys(BUILDERS);

/**
 * Rebuild a ticket's per-run data from the save's seed. Both the game (when a
 * case is opened) and the e2e bot call this with the same seed, so what is on
 * screen and the expected answers are built from one source and never drift.
 * A ticket with no per-run data is returned unchanged.
 */
export function withRunData(ticket: Ticket, seed: number): Ticket {
  const build = BUILDERS[ticket.id];
  return build ? build(seed) : ticket;
}
