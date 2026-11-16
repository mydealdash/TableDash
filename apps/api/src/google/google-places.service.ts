/**
 * Google Places API (New) integration: rating, reviews and photos for a restaurant's
 * linked Google listing.
 *
 * Google's terms: only the place ID may be stored. Reviews, ratings and photos are
 * fetched live on every view and never written to our database. Attribution
 * (Google Maps text/logo, review/photo authors, links back to Google Maps) is
 * required and returned to clients so they can render it.
 */
import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const BASE = process.env.GOOGLE_PLACES_BASE_URL ?? 'https://places.googleapis.com/v1'; // override only for local testing
const DETAILS_FIELDS = ['id', 'displayName', 'rating', 'userRatingCount', 'googleMapsUri', 'reviews', 'photos'].join(',');
const SEARCH_FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri'].join(',');
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export interface GoogleAuthor { name: string; uri: string | null; photoUri: string | null }
export interface GoogleListing {
  enabled: true;
  placeId: string;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  reviews: Array<{
    author: GoogleAuthor; rating: number; text: string; originalText: string | null; translated: boolean; languageCode: string | null;
    relativeTime: string | null; publishTime: string | null; googleMapsUri: string | null; flagContentUri: string | null;
    visitDate: { year: number; month: number } | null;
  }>;
  photos: Array<{ name: string; width: number; height: number; authors: GoogleAuthor[]; googleMapsUri: string | null; flagContentUri: string | null }>;
}

const author = (a: any): GoogleAuthor => ({ name: a?.displayName ?? 'Google user', uri: a?.uri ?? null, photoUri: a?.photoUri ?? null });

@Injectable()
export class GooglePlacesService {
  private readonly log = new Logger('GooglePlaces');
  get configured() { return !!process.env.GOOGLE_MAPS_API_KEY; }

  private async call(url: string, init: RequestInit & { fieldMask?: string } = {}) {
    if (!this.configured) throw new ServiceUnavailableException('Google integration is not configured (GOOGLE_MAPS_API_KEY)');
    const { fieldMask, ...rest } = init;
    const res = await fetch(url, {
      ...rest,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY!, ...(fieldMask ? { 'X-Goog-FieldMask': fieldMask } : {}), ...(rest.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text();
      this.log.warn(`Google ${res.status}: ${body.slice(0, 300)}`);
      if (res.status === 404) throw new BadRequestException('Google listing not found');
      throw new BadGatewayException('Google Places request failed');
    }
    return res.json() as Promise<any>;
  }

  /** Text search used by restaurant staff/admins to find and link their Google listing. */
  async search(query: string, near?: { lat: number; lng: number }) {
    const body: any = { textQuery: query, includedType: 'restaurant', strictTypeFiltering: false, pageSize: 8 };
    if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 5000 } };
    const data = await this.call(`${BASE}/places:searchText`, { method: 'POST', body: JSON.stringify(body), fieldMask: SEARCH_FIELDS });
    return (data.places ?? []).map((p: any) => ({
      placeId: p.id, name: p.displayName?.text ?? '', address: p.formattedAddress ?? '', rating: p.rating ?? null,
      userRatingCount: p.userRatingCount ?? null, googleMapsUri: p.googleMapsUri ?? null,
    }));
  }

  /** Live listing content for display (never persisted). */
  async listing(placeId: string, languageCode = 'en'): Promise<GoogleListing> {
    const p = await this.call(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`, { fieldMask: DETAILS_FIELDS });
    return {
      enabled: true,
      placeId: p.id ?? placeId,
      rating: p.rating ?? null,
      userRatingCount: p.userRatingCount ?? null,
      googleMapsUri: p.googleMapsUri ?? null,
      reviews: (p.reviews ?? []).map((r: any) => ({
        author: author(r.authorAttribution),
        rating: r.rating ?? 0,
        text: r.text?.text ?? r.originalText?.text ?? '',
        originalText: r.originalText?.text ?? null,
        // Translated when Google's display text differs in language from the original.
        translated: !!(r.originalText?.languageCode && r.text?.languageCode && r.originalText.languageCode !== r.text.languageCode),
        languageCode: r.originalText?.languageCode ?? r.text?.languageCode ?? null,
        relativeTime: r.relativePublishTimeDescription ?? null,
        publishTime: r.publishTime ?? null,
        googleMapsUri: r.googleMapsUri ?? p.googleMapsUri ?? null,
        flagContentUri: r.flagContentUri ?? null,
        visitDate: r.visitDate ? { year: r.visitDate.year, month: r.visitDate.month } : null,
      })),
      photos: (p.photos ?? []).slice(0, 10).map((ph: any) => ({
        name: ph.name, width: ph.widthPx ?? 0, height: ph.heightPx ?? 0, authors: (ph.authorAttributions ?? []).map(author),
        googleMapsUri: ph.googleMapsUri ?? p.googleMapsUri ?? null, flagContentUri: ph.flagContentUri ?? null,
      })),
    };
  }

  /** Short-lived photo URL from Google (the API key never reaches the client). */
  async photoUrl(name: string, maxWidth: number) {
    if (!PHOTO_NAME.test(name)) throw new BadRequestException('Invalid photo name');
    const w = Math.max(100, Math.min(1600, Math.round(maxWidth) || 800));
    const data = await this.call(`${BASE}/${name}/media?maxWidthPx=${w}&skipHttpRedirect=true`);
    if (!data.photoUri) throw new BadGatewayException('No photo URL returned');
    return data.photoUri as string;
  }
}
