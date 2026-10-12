export type DealershipView = Readonly<{
  id: string;
  name: string;
  /** IANA zone name. */
  timeZone: string;
  /** Local wall-clock `HH:mm`. */
  opensAt: string;
  /** Local wall-clock `HH:mm`. */
  closesAt: string;
  createdAt: Date;
}>;

export type DealershipDetailView = DealershipView &
  Readonly<{
    /** Service types at least one technician here is qualified for (BR-6), sorted. */
    supportedServiceTypeIds: readonly string[];
  }>;
