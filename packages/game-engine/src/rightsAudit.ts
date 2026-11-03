/**
 * Rights audit — license labels must match ownership evidence.
 * Never treat a metadata string as verified public-domain or commercial clearance.
 */

import type {
  CatalogLicense,
  CatalogRightsMeta,
  OwnershipClass,
  SongCatalogEntry,
} from '@beatlink/shared';

export interface RightsAuditFinding {
  trackId: string;
  severity: 'info' | 'warn' | 'block';
  code: string;
  message: string;
}

export interface RightsAuditResult {
  ok: boolean;
  commercialEligibleAny: false;
  findings: RightsAuditFinding[];
  byTrack: Record<
    string,
    {
      license: CatalogLicense;
      ownershipClass: OwnershipClass | 'missing';
      licenseLabel: string | null;
      commercialEligible: false;
      attributionVerified: boolean;
    }
  >;
}

const PD_CLAIM_WITHOUT_VERIFIED: RegExp =
  /public.?domain|pd-original|pd.?arrangement/i;

/**
 * Audit catalog entries for ownership vs license honesty.
 */
export function auditCatalogRights(songs: SongCatalogEntry[]): RightsAuditResult {
  const findings: RightsAuditFinding[] = [];
  const byTrack: RightsAuditResult['byTrack'] = {};

  for (const song of songs) {
    const rights = song.rights;
    const ownershipClass = (rights?.ownershipClass ?? null) as OwnershipClass | null;
    const licenseLabel = rights?.licenseLabel ?? null;
    const attributionVerified = Boolean(rights?.attributionVerified);
    const commercial = rights?.commercialEligible === true;

    byTrack[song.id] = {
      license: song.license,
      ownershipClass: ownershipClass ?? 'missing',
      licenseLabel,
      commercialEligible: false,
      attributionVerified,
    };

    if (commercial) {
      findings.push({
        trackId: song.id,
        severity: 'block',
        code: 'commercial_claimed_without_gate',
        message:
          'commercialEligible must remain false until verified human attribution + commercial review.',
      });
    }

    if (song.license === 'public_domain') {
      if (ownershipClass !== 'verified_public_domain') {
        findings.push({
          trackId: song.id,
          severity: 'block',
          code: 'pd_label_without_verified_ownership',
          message:
            'public_domain license requires ownershipClass=verified_public_domain with third-party source evidence — metadata alone is insufficient.',
        });
      }
      if (!rights?.thirdPartyLicense && ownershipClass !== 'verified_public_domain') {
        findings.push({
          trackId: song.id,
          severity: 'block',
          code: 'pd_missing_third_party_evidence',
          message: 'PD claim lacks thirdPartyLicense / verified source evidence.',
        });
      }
    }

    // First-party originals must not wear a naked PD license.
    if (
      ownershipClass === 'first_party_original' &&
      song.license === 'public_domain'
    ) {
      findings.push({
        trackId: song.id,
        severity: 'block',
        code: 'first_party_labeled_pd',
        message:
          'First-party originals should use synthetic_original or an explicit CC dedication deed — not an unverified PD stamp.',
      });
    }

    // CC licenses need a deed URL when claimed.
    if (song.license === 'creative_commons') {
      if (!rights?.ccDeedUrl && !rights?.thirdPartyLicense?.deedUrl) {
        findings.push({
          trackId: song.id,
          severity: 'warn',
          code: 'cc_missing_deed',
          message: 'creative_commons license should cite a CC deed URL.',
        });
      }
      if (
        ownershipClass !== 'first_party_original' &&
        ownershipClass !== 'third_party_licensed' &&
        ownershipClass !== 'creator_attested'
      ) {
        findings.push({
          trackId: song.id,
          severity: 'warn',
          code: 'cc_ownership_unclear',
          message: 'CC release should declare first_party_original or third_party_licensed ownership.',
        });
      }
    }

    // Attribution text that says PD while license is not verified PD.
    if (
      PD_CLAIM_WITHOUT_VERIFIED.test(`${song.title} ${rights?.attribution ?? ''} ${licenseLabel ?? ''}`) &&
      song.license !== 'public_domain' &&
      ownershipClass !== 'verified_public_domain'
    ) {
      // Soft warn — titles may historically contain "PD" in ids; prefer license fields.
      if (PD_CLAIM_WITHOUT_VERIFIED.test(rights?.attribution ?? '') || PD_CLAIM_WITHOUT_VERIFIED.test(licenseLabel ?? '')) {
        findings.push({
          trackId: song.id,
          severity: 'warn',
          code: 'pd_wording_in_attribution',
          message: 'Attribution/licenseLabel mentions public domain without verified_public_domain ownership.',
        });
      }
    }

    if (!rights) {
      findings.push({
        trackId: song.id,
        severity: 'warn',
        code: 'missing_rights_block',
        message: 'Song lacks rights metadata block — ownership vs license cannot be audited.',
      });
    } else if (!ownershipClass) {
      findings.push({
        trackId: song.id,
        severity: 'warn',
        code: 'missing_ownership_class',
        message: 'rights.ownershipClass missing — separate ownership from license labels.',
      });
    }

    if (rights && rights.commercialEligible !== false && rights.commercialEligible != null) {
      // already blocked above when true
    } else if (rights && song.launchEligible && rights.attributionVerified !== true && song.license === 'creator_owned') {
      findings.push({
        trackId: song.id,
        severity: 'info',
        code: 'creator_attribution_unverified',
        message: 'Creator-owned launch path should keep attributionVerified=false until human review.',
      });
    }
  }

  const blocked = findings.some((f) => f.severity === 'block');
  return {
    ok: !blocked,
    commercialEligibleAny: false,
    findings,
    byTrack,
  };
}

/** Normalize a rights meta blob to enforce commercialEligible false. */
export function enforceNonCommercialRights(
  rights: CatalogRightsMeta | undefined | null,
): CatalogRightsMeta | null {
  if (!rights) return null;
  return {
    ...rights,
    commercialEligible: false,
    ripForbidden: true,
    drmBypassForbidden: true,
  };
}
