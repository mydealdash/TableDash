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
// Diner search: enough to render a result card (one thumbnail photo).
const DINER_SEARCH_FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.shortFormattedAddress', 'places.location', 'places.rating',
  'places.userRatingCount', 'places.priceLevel', 'places.primaryTypeDisplayName', 'places.photos', 'places.googleMapsUri', 'places.businessStatus', 'nextPageToken'].join(',');
// Full page for a restaurant that isn't on TableDash yet.
const PLACE_FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'rating', 'userRatingCount', 'priceLevel', 'primaryTypeDisplayName',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri', 'regularOpeningHours', 'googleMapsUri', 'reviews', 'photos', 'businessStatus', 'editorialSummary'].join(',');
const PRICE: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };
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

  /**
   * Diner-facing restaurant search (Text Search). Results are shown live and never stored;
   * TableDash matches them to registered restaurants by place ID only.
   */
  async searchRestaurants(input: { query: string; near?: { lat: number; lng: number } | null; pageToken?: string; languageCode?: string }) {
    const body: any = { textQuery: input.query, includedType: 'restaurant', pageSize: 20, languageCode: input.languageCode ?? 'en' };
    if (input.near) body.locationBias = { circle: { center: { latitude: input.near.lat, longitude: input.near.lng }, radius: 8000 } };
    if (input.pageToken) body.pageToken = input.pageToken;
    const data = await this.call(`${BASE}/places:searchText`, { method: 'POST', body: JSON.stringify(body), fieldMask: DINER_SEARCH_FIELDS });
    return {
      nextPageToken: (data.nextPageToken as string | undefined) ?? null,
      places: (data.places ?? []).filter((p: any) => p.businessStatus !== 'CLOSED_PERMANENTLY').map((p: any) => ({
        placeId: p.id as string,
        name: p.displayName?.text ?? '',
        address: p.shortFormattedAddress ?? p.formattedAddress ?? '',
        lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
        rating: p.rating ?? null, userRatingCount: p.userRatingCount ?? null,
        priceBand: PRICE[p.priceLevel] ?? null, type: p.primaryTypeDisplayName?.text ?? null,
        temporarilyClosed: p.businessStatus === 'CLOSED_TEMPORARILY',
        googleMapsUri: p.googleMapsUri ?? null,
        photo: p.photos?.[0] ? { name: p.photos[0].name as string, authors: (p.photos[0].authorAttributions ?? []).map(author) } : null,
      })),
    };
  }

  /** Full details for a restaurant page (unregistered places). Never stored. */
  async place(placeId: string, languageCode = 'en') {
    const p = await this.call(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`, { fieldMask: PLACE_FIELDS });
    const listing = this.toListing(p, placeId);
    return {
      ...listing,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
      priceBand: PRICE[p.priceLevel] ?? null, type: p.primaryTypeDisplayName?.text ?? null,
      phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null, phoneIntl: p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null, hours: p.regularOpeningHours?.weekdayDescriptions ?? [], openNow: p.regularOpeningHours?.openNow ?? null,
      summary: p.editorialSummary?.text ?? null, businessStatus: p.businessStatus ?? null,
    };
  }

  /** Name and address only (cheapest details request) for admin views. */
  async basic(placeId: string) {
    const p = await this.call(`${BASE}/places/${encodeURIComponent(placeId)}`, { fieldMask: 'id,displayName,formattedAddress,googleMapsUri' });
    return { placeId, name: p.displayName?.text ?? '', address: p.formattedAddress ?? '', googleMapsUri: p.googleMapsUri ?? null };
  }

  /** Live listing content for display (never persisted). */
  async listing(placeId: string, languageCode = 'en'): Promise<GoogleListing> {
    const p = await this.call(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=${encodeURIComponent(languageCode)}`, { fieldMask: DETAILS_FIELDS });
    return this.toListing(p, placeId);
  }

  private toListing(p: any, placeId: string): GoogleListing {
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
