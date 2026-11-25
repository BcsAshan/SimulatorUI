// TypeScript shapes of the Pss engine contract (Airline-Simulator/docs/API_REFERENCE.md).
// Only the fields the UI reads are typed; the server sends more. Enums arrive as numbers.

export interface ApiErrorItem {
  id?: string;
  code: string;
  message: string;
  rawMessage?: string | null;
  type?: string;
  details?: Record<string, unknown> | null;
}

export interface ApiMessage {
  code: string;
  value: string;
  type: string;
}

export interface Envelope<T> {
  data: T;
  errors?: ApiErrorItem[];
  messages?: ApiMessage[];
}

// ---------- identity ----------

export interface TokenResponse {
  token: string;
  expires?: string;
  idleTimeoutInMinutes: number;
  cultureCode?: string;
  currencyCode?: string;
  roleCode?: string;
  locationCode?: string;
  domainCode?: string;
  organizationCode?: string;
  userKey?: string;
  personKey?: string | null;
}

/** 1 Customer, 2 Agent, 3 Anonymous */
export type UserType = 1 | 2 | 3;

export interface SessionInfo {
  sessionId: string;
  userType: UserType;
  agentCode: string;
  roleCode: string;
  domainCode: string;
  locationCode: string;
  idleTimeoutInMinutes: number;
}

// ---------- reference data ----------

export interface Station {
  stationCode: string;
  name: string;
  shortName?: string;
  countryCode: string;
  macCode?: string | null;
  currencyCode?: string;
  timeZoneCode?: string;
  inActive: boolean;
}

export interface Market {
  locationCode: string;
  travelLocationCode: string;
  inActive: boolean;
}

export interface CodeItem {
  code: string;
  name: string;
  inActive: boolean;
}

export interface Country {
  countryCode: string;
  name: string;
  inActive: boolean;
}

// ---------- availability ----------

export interface Designator {
  origin: string;
  destination: string;
  departure: string; // station-local, no offset
  arrival: string;
}

export interface FlightIdentifier {
  identifier: string;
  carrierCode: string;
  opSuffix?: string | null;
}

export interface LegInfo {
  departureTimeUtc: string;
  arrivalTimeUtc: string;
  equipmentType?: string | null;
  capacity?: number;
  sold?: number;
}

export interface Leg {
  legKey: string;
  designator?: Designator;
  legInfo: LegInfo;
  flightReference?: string | null;
}

export interface AvailableSegment {
  segmentKey: string;
  identifier: FlightIdentifier;
  designator: Designator;
  international: boolean;
  cabinOfService?: string | null;
  legs: Leg[];
}

export interface JourneyFareDetail {
  availableCount: number;
  status: number;
  reference: string;
}

export interface JourneyFare {
  fareAvailabilityKey: string;
  details: JourneyFareDetail[];
  isSumOfSector: boolean;
}

export interface AvailableJourney {
  flightType: number;
  stops: number;
  designator: Designator;
  journeyKey: string;
  segments: AvailableSegment[];
  fares: JourneyFare[];
}

export interface AvailabilityTrip {
  date: string;
  journeysAvailableByMarket: Record<string, AvailableJourney[]>;
}

export interface ServiceCharge {
  type: number; // 0 fare, 1 discount, 4 travel fee, 5 tax, 7 promo discount
  code?: string | null;
  detail?: string | null;
  amount: number;
  currencyCode: string;
}

export interface PassengerFareQuote {
  passengerType: string;
  fareAmount?: number;
  discountedFare?: number;
  multiplier?: number;
  serviceCharges: ServiceCharge[];
}

export interface FareQuote {
  classOfService: string;
  fareBasisCode?: string | null;
  productClass?: string | null;
  ruleNumber?: string | null;
  travelClassCode?: string | null;
  reference?: string;
  passengerFares: PassengerFareQuote[];
}

export interface FareAvailability {
  fareAvailabilityKey: string;
  isSumOfSector: boolean;
  totals: {
    fareTotal: number;
    revenueTotal: number;
    publishedTotal: number;
    discountedTotal: number;
  };
  fares: FareQuote[];
}

export interface AvailabilityResponse {
  results: { trips: AvailabilityTrip[] }[];
  faresAvailable: Record<string, FareAvailability>;
  currencyCode: string;
  includeTaxesAndFees: boolean;
}

// ---------- booking ----------

export interface Name {
  first?: string | null;
  middle?: string | null;
  last?: string | null;
  title?: string | null;
  suffix?: string | null;
}

export interface Passenger {
  passengerKey: string;
  passengerTypeCode: string;
  name: Name;
  info: {
    nationality?: string | null;
    residentCountry?: string | null;
    gender?: number | null; // 0 XX, 1 Male, 2 Female
    dateOfBirth?: string | null;
  };
}

export interface PhoneNumber {
  type: number | string;
  number: string;
}

export interface Contact {
  contactTypeCode: string;
  name?: Name | null;
  emailAddress?: string | null;
  phoneNumbers: PhoneNumber[];
  distributionOption?: number | string;
}

export interface SegmentFare {
  classOfService: string;
  fareBasisCode?: string | null;
  productClass?: string | null;
  passengerFares: { passengerType: string; serviceCharges: ServiceCharge[] }[];
}

export interface BookingSegment {
  segmentKey: string;
  identifier: FlightIdentifier;
  designator: Designator;
  status: number; // 3 held, 6 confirmed
  cabinOfService?: string | null;
  international: boolean;
  fares: SegmentFare[];
  legs: Leg[];
}

export interface BookingJourney {
  journeyKey: string;
  flightType: number;
  stops: number;
  designator: Designator;
  segments: BookingSegment[];
}

export interface BookingPayment {
  paymentKey: string;
  code: string;
  status: number; // 0 New, 1 Received, 2 Pending, 3 Approved, 4 Declined
  authorizationStatus: number;
  type: number;
  createdDate: string;
  details: { accountNumber?: string | null; accountName?: string | null; text?: string | null };
  amounts: { amount: number; currencyCode: string };
}

export interface Booking {
  bookingKey: string | null;
  recordLocator: string | null;
  currencyCode: string;
  info: {
    status: number; // 0 in state, 1 Hold, 2 Confirmed, 3 Closed, 4 HoldCanceled
    paidStatus: number; // 0 UnderPaid, 1 PaidInFull, 2 OverPaid
    bookedDate?: string | null;
    createdDate?: string | null;
  };
  hold: { expiration?: string | null } | null;
  breakdown: {
    totalAmount: number;
    balanceDue: number;
    journeyTotals: { totalAmount: number; totalTax: number; totalDiscount: number };
    journeys: Record<string, { journeyKey: string; totalAmount: number; totalTax: number; totalDiscount: number }>;
  };
  contacts: Record<string, Contact>;
  passengers: Record<string, Passenger>;
  journeys: BookingJourney[];
  payments: BookingPayment[];
  comments?: { text?: string | null; type: number }[];
}

export interface PaymentMethodField {
  paymentMethodFieldCode: string;
  name?: string;
  requiredType: number;
  valueMinLength?: number;
  valueMaxLength?: number;
}

export interface PaymentMethod {
  paymentMethodCode: string;
  name: string;
  paymentMethodType: number;
  allowed: boolean;
  paymentMethodFields: Record<string, PaymentMethodField>;
}

// ---------- UI-side search state ----------

export interface PaxCounts {
  ADT: number;
  CHD: number;
}

export interface SearchCriteria {
  origin: string;
  destination: string;
  departDate: string; // yyyy-MM-dd
  returnDate: string | null;
  pax: PaxCounts;
}

export interface FareSelection {
  journeyKey: string;
  fareAvailabilityKey: string;
}
