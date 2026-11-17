CREATE TABLE [clients] (
	[id] BIGINT IDENTITY,
	[client_code] VARCHAR(24) NOT NULL UNIQUE,
	[legal_name] NVARCHAR(200) NOT NULL,
	[country_code] CHAR(2) NOT NULL,
	[tax_identifier] VARCHAR(32),
	[default_incoterm] CHAR(3),
	[credit_limit_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[is_active] BIT NOT NULL DEFAULT 1,
	[created_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The party that is invoiced. Shipper and consignee are recorded per shipment because a forwarder routinely bills a third party who is neither.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Short code quoted on every document and in EDI messages. ASCII only, so varchar rather than nvarchar.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'client_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Name as registered. Unicode because a consignee name on customs paperwork must be reproduced exactly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'legal_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 3166-1 alpha-2 of the registered address. Decides which customs regime applies by default.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'country_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'VAT, EORI or equivalent trader number. Without it a customs entry cannot be filed at all.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'tax_identifier';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO incoterm normally agreed with this client, e.g. FOB, CIF, DAP. A default, never the truth — the booking carries the agreed one.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'default_incoterm';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Credit exposure ceiling in minor currency units. Null means prepay only.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'credit_limit_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency this client is invoiced in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 0 when the client stops trading. A bit with a literal 1 rather than a boolean with true, because SQL Server has no boolean type.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Row creation time in UTC. SYSUTCDATETIME rather than GETDATE, so the value does not shift when the server moves region.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'clients',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE TABLE [carriers] (
	[id] BIGINT IDENTITY,
	[scac_code] VARCHAR(8) UNIQUE,
	[iata_code] CHAR(3),
	[name] NVARCHAR(160) NOT NULL,
	[mode] VARCHAR(16) NOT NULL DEFAULT 'sea',
	[edi_partner_id] VARCHAR(40),
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who physically moves the goods, as opposed to the forwarder who arranges it. One row per carrier per mode.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Standard Carrier Alpha Code for ocean and road carriers. Null for airlines, which use an IATA prefix instead.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'scac_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'IATA airline designator, used on the air waybill prefix.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'iata_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Trading name shown on quotes and documents.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'sea | air | road | rail. A carrier row is per mode because the same group trading in two modes has different codes, contracts and message formats.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'mode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Identifier used in EDI or API integration. Null for carriers still handled by email.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'edi_partner_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 0 when the carrier is no longer contracted; historic shipments still resolve.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'carriers',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE INDEX [IX_carriers_mode_active]
ON [carriers] ([mode], [is_active]);
GO

CREATE TABLE [rate_contracts] (
	[id] BIGINT IDENTITY,
	[carrier_id] BIGINT NOT NULL,
	[contract_number] VARCHAR(40) NOT NULL,
	[mode] VARCHAR(16) NOT NULL DEFAULT 'sea',
	[origin_locode] VARCHAR(5) NOT NULL,
	[destination_locode] VARCHAR(5) NOT NULL,
	[equipment_type] VARCHAR(12),
	[rate_basis] VARCHAR(16) NOT NULL DEFAULT 'per_container',
	[rate_minor] BIGINT NOT NULL,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[free_days] SMALLINT,
	[valid_from] DATE NOT NULL,
	[valid_to] DATE NOT NULL,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One row per lane, equipment type and validity window. Rates are a calendar, not a price list: the correct buy rate for a shipment is the row whose lane matches and whose window contains the shipment date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Carrier the rate was agreed with.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'carrier_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Carrier contract or tariff reference. Not unique on its own — one contract covers many lanes, and each lane is a row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'contract_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'sea | air | road | rail. Must match the carrier mode.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'mode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE of the origin port or airport, e.g. CNSHA. Five characters by standard, which is why this is fixed and short.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'origin_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE of the destination.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'destination_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Container type the rate applies to, e.g. 20GP, 40HC, 40RF. Null for air and for loose cargo priced by weight.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'equipment_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'per_container | per_kg | per_cbm | per_shipment. Air freight is chargeable weight, sea FCL is per box, and the two cannot share a column without this.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'rate_basis';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Buy rate in minor currency units for one unit of rate_basis. Integer minor units rather than the SQL Server money type, which is a fixed four-decimal binary that quietly loses cents on division.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'rate_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of rate_minor. Ocean rates are quoted in dollars regardless of the lane.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Demurrage and detention free time in days. Its absence is the most common reason a quote turns out to be wrong.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'free_days';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day the rate applies. Contracts are dated, and a shipment is rated on its own date, not today.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'valid_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day the rate applies. Ocean contracts typically run quarterly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'rate_contracts',
    @level2type=N'COLUMN',@level2name=N'valid_to';
GO

CREATE INDEX [IX_rates_lane_mode_from]
ON [rate_contracts] ([origin_locode], [destination_locode], [mode], [valid_from]);
GO

CREATE INDEX [IX_rates_carrier_contract]
ON [rate_contracts] ([carrier_id], [contract_number]);
GO

CREATE TABLE [bookings] (
	[id] BIGINT IDENTITY,
	[public_reference] UNIQUEIDENTIFIER NOT NULL UNIQUE DEFAULT NEWID(),
	[booking_number] VARCHAR(24) NOT NULL UNIQUE,
	[client_id] BIGINT NOT NULL,
	[incoterm] CHAR(3) NOT NULL,
	[incoterm_place] NVARCHAR(120),
	[mode] VARCHAR(16) NOT NULL DEFAULT 'sea',
	[service_type] VARCHAR(16) NOT NULL DEFAULT 'fcl',
	[origin_locode] VARCHAR(5) NOT NULL,
	[destination_locode] VARCHAR(5) NOT NULL,
	[cargo_ready_date] DATE,
	[required_delivery_date] DATE,
	[status] VARCHAR(24) NOT NULL DEFAULT 'draft',
	[created_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The commercial agreement with the client: what is moving, between where, on what terms. It is deliberately separate from the shipments that execute it, because one booking regularly splits into several and the commercial terms must not split with it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Externally shared identifier. A GUID rather than the bigint id, so a client portal URL cannot be walked to enumerate other bookings.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'public_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Human reference quoted on email and paperwork, e.g. BKG-2026-004182.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'booking_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Party being invoiced for this booking.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'client_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Agreed incoterm, e.g. EXW, FOB, CIF, DAP, DDP. It decides who pays which leg and where risk transfers, so it is settled here and copied nowhere.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'incoterm';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Named place qualifying the incoterm. CIF without a named port is not a term, it is an argument.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'incoterm_place';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'sea | air | road | rail | multimodal. The primary mode; individual legs may differ.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'mode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'fcl | lcl | air | ftl | ltl. LCL is what makes consolidation across shipments necessary.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'service_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE where the goods are collected or received.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'origin_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE of final delivery.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'destination_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the shipper says the cargo will be ready. The planning input the whole schedule is built backwards from.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'cargo_ready_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the buyer needs it. The gap against the routing is what justifies paying for air.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'required_delivery_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'draft | confirmed | in_transit | completed | cancelled. A booking can be cancelled long after shipments exist under it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the booking was raised, in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'bookings',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [IX_bookings_client_status]
ON [bookings] ([client_id], [status]);
GO

CREATE INDEX [IX_bookings_ready_date]
ON [bookings] ([cargo_ready_date]);
GO

CREATE TABLE [shipments] (
	[id] BIGINT IDENTITY,
	[booking_id] BIGINT NOT NULL,
	[shipment_number] VARCHAR(24) NOT NULL UNIQUE,
	[master_document_number] VARCHAR(40),
	[house_document_number] VARCHAR(40),
	[shipper_name] NVARCHAR(200) NOT NULL,
	[consignee_name] NVARCHAR(200) NOT NULL,
	[gross_weight_kg] DECIMAL(12,3) NOT NULL DEFAULT 0,
	[volume_cbm] DECIMAL(12,4) NOT NULL DEFAULT 0,
	[package_count] INTEGER NOT NULL DEFAULT 0,
	[goods_description] NVARCHAR(500),
	[is_hazardous] BIT NOT NULL DEFAULT 0,
	[status] VARCHAR(24) NOT NULL DEFAULT 'planned',
	[created_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The consignment that actually travels. It carries the physical facts and the transport document numbers; the commercial terms stay on the booking.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Booking this shipment executes. Several shipments per booking is normal when cargo is not all ready at once.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'booking_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Operational reference used internally and with the carrier.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'shipment_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Master bill of lading or master air waybill number issued by the carrier. Null until the carrier releases it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'master_document_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'House bill issued by the forwarder to its own client. The pair is what makes consolidation legally workable.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'house_document_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipper exactly as it must appear on the transport document, snapshotted so a later master-data edit cannot alter an issued bill.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'shipper_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Consignee as it appears on the document. Frequently not the client being invoiced.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'consignee_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Declared gross weight. Grams matter: air freight is charged on the greater of actual and volumetric weight.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'gross_weight_kg';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cubic metres. The other half of the chargeable weight calculation, and the basis for LCL pricing.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'volume_cbm';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Number of outer packages as manifested. Customs counts pieces, not pallets.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'package_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plain description of the cargo as it will read on the bill of lading.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'goods_description';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 1 for dangerous goods, which changes the carrier, the paperwork and often the routing entirely.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'is_hazardous';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'planned | booked | in_transit | arrived | customs_hold | delivered | cancelled. customs_hold is its own state because it stops the clock on everything downstream.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the shipment record was created, in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipments',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [IX_shipments_booking]
ON [shipments] ([booking_id]);
GO

CREATE INDEX [IX_shipments_status]
ON [shipments] ([status]);
GO

CREATE INDEX [IX_shipments_master_doc]
ON [shipments] ([master_document_number]);
GO

CREATE TABLE [containers] (
	[id] BIGINT IDENTITY,
	[container_number] VARCHAR(11) NOT NULL,
	[equipment_type] VARCHAR(12) NOT NULL DEFAULT '40HC',
	[seal_number] VARCHAR(24),
	[tare_weight_kg] DECIMAL(10,3),
	[is_shipper_owned] BIT NOT NULL DEFAULT 0,
	[reefer_setpoint_c] DECIMAL(5,2),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A physical box on one movement. Modelled as an occurrence rather than a permanent asset, because a forwarder never owns the equipment and only cares about it between stuffing and unstuffing.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 6346 equipment number, four letters and seven digits including a check digit. Not unique in this table: the same box is reused for years and appears on many voyages.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'container_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'20GP | 40GP | 40HC | 40RF | 45HC and similar. Decides capacity and whether a reefer setpoint is required.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'equipment_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Carrier or customs seal applied at stuffing. A seal number that changes in transit is an incident, not a data correction.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'seal_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Empty weight of the box, needed to derive verified gross mass from a weighbridge reading.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'tare_weight_kg';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 1 for shipper-owned containers, which are exempt from detention charges and must not be invoiced for them.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'is_shipper_owned';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Required temperature in Celsius for refrigerated equipment. Null for dry boxes; a null on a reefer is a claim waiting to happen.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'containers',
    @level2type=N'COLUMN',@level2name=N'reefer_setpoint_c';
GO

CREATE INDEX [IX_containers_number]
ON [containers] ([container_number]);
GO

CREATE TABLE [shipment_containers] (
	[shipment_id] BIGINT,
	[container_id] BIGINT,
	[package_count] INTEGER NOT NULL DEFAULT 0,
	[gross_weight_kg] DECIMAL(12,3) NOT NULL DEFAULT 0,
	[volume_cbm] DECIMAL(12,4) NOT NULL DEFAULT 0,
	[stuffed_at] DATETIME2,
	PRIMARY KEY([shipment_id], [container_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Consolidation. The many-to-many is the entire point: one full container holds one shipment, one LCL box holds twenty, and a single oversized shipment spreads across three boxes. Weight and volume live on the link because they are properties of the pairing, not of either side.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipment loaded into the container. Half of the composite key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'shipment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Container carrying it. Half of the composite key, so the same box can carry several shipments.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'container_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Pieces of this shipment inside this box, which is how a part-load is apportioned.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'package_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Weight of this shipment inside this box. The sum across shipments plus tare must equal the verified gross mass declared to the carrier.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'gross_weight_kg';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Volume of this shipment inside this box, the basis for splitting LCL freight cost fairly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'volume_cbm';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When this cargo was loaded into the box, in UTC. Null until the warehouse confirms.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_containers',
    @level2type=N'COLUMN',@level2name=N'stuffed_at';
GO

CREATE INDEX [IX_shipcon_container]
ON [shipment_containers] ([container_id]);
GO

CREATE TABLE [shipment_legs] (
	[id] BIGINT IDENTITY,
	[shipment_id] BIGINT NOT NULL,
	[leg_sequence] SMALLINT NOT NULL,
	[mode] VARCHAR(16) NOT NULL DEFAULT 'sea',
	[carrier_id] BIGINT,
	[origin_locode] VARCHAR(5) NOT NULL,
	[destination_locode] VARCHAR(5) NOT NULL,
	[vessel_or_flight] VARCHAR(60),
	[voyage_number] VARCHAR(24),
	[scheduled_departure] DATETIMEOFFSET,
	[scheduled_arrival] DATETIMEOFFSET,
	[actual_departure] DATETIMEOFFSET,
	[actual_arrival] DATETIMEOFFSET,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One row per movement between two points. Multi-leg is the normal case, not an exception, and keeping planned and actual timestamps side by side is what makes delay attributable to a specific carrier on a specific leg.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipment this leg belongs to.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'shipment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Order of the leg within the journey, starting at 1. Ordering by departure time fails for legs that have not been scheduled yet.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'leg_sequence';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'sea | air | road | rail. A door-to-door move is typically road, sea, road, and each has a different carrier and document.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'mode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Carrier operating this leg. Null while the leg is planned but not yet awarded.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'carrier_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE where the leg starts.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'origin_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'UN/LOCODE where the leg ends. It must equal the next leg origin, and a gap between them is a transhipment nobody has planned.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'destination_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Vessel name or flight number for this leg.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'vessel_or_flight';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Voyage or rotation number, which together with the vessel identifies the sailing.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'voyage_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Planned departure with its UTC offset. Offsets are stored rather than normalised because a port cut-off is a local-time fact that operations staff must read back unchanged.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'scheduled_departure';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Planned arrival with offset.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'scheduled_arrival';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Actual departure. Null until it sails; the difference from the schedule is the only honest source of carrier reliability.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'actual_departure';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Actual arrival. Null until it berths or lands.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'shipment_legs',
    @level2type=N'COLUMN',@level2name=N'actual_arrival';
GO

CREATE UNIQUE INDEX [UQ_legs_shipment_sequence]
ON [shipment_legs] ([shipment_id], [leg_sequence]);
GO

CREATE INDEX [IX_legs_carrier_departure]
ON [shipment_legs] ([carrier_id], [scheduled_departure]);
GO

CREATE TABLE [leg_events] (
	[id] BIGINT IDENTITY,
	[leg_id] BIGINT NOT NULL,
	[event_code] VARCHAR(24) NOT NULL,
	[event_time] DATETIMEOFFSET NOT NULL,
	[location_locode] VARCHAR(5),
	[source] VARCHAR(16) NOT NULL DEFAULT 'manual',
	[remarks] NVARCHAR(400),
	[recorded_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The append-only milestone trail. Rows are never updated: a corrected milestone is a new row with a later recorded_at, so the tracking history a client was shown last week can still be reconstructed.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Leg the milestone belongs to. Events hang off the leg rather than the shipment so a delay is attributable to the carrier that caused it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'leg_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'gate_in | loaded | departed | transhipped | arrived | discharged | customs_cleared | gate_out | delivered | exception. A controlled vocabulary, because every carrier names these differently and the tracking page must not.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'event_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When it happened, with the local offset as reported. A vessel departure at 23:40 local is not the next day, and normalising it to UTC in storage is how tracking pages end up showing the wrong date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'event_time';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Where it happened. Often a transhipment port the client never sees on the booking.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'location_locode';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'edi | carrier_api | portal | manual. Provenance matters: an EDI milestone is evidence, a manually keyed one is a claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'source';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Free text from the carrier message, kept verbatim for disputes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'remarks';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the event reached this system, in UTC. Carriers routinely report two days late, and the gap from event_time is what makes tracking look broken.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'leg_events',
    @level2type=N'COLUMN',@level2name=N'recorded_at';
GO

CREATE INDEX [IX_events_leg_time]
ON [leg_events] ([leg_id], [event_time]);
GO

CREATE INDEX [IX_events_code_time]
ON [leg_events] ([event_code], [event_time]);
GO

CREATE TABLE [customs_declarations] (
	[id] BIGINT IDENTITY,
	[shipment_id] BIGINT NOT NULL,
	[declaration_type] VARCHAR(16) NOT NULL DEFAULT 'import',
	[country_code] CHAR(2) NOT NULL,
	[customs_office_code] VARCHAR(16),
	[declaration_reference] VARCHAR(40),
	[hs_code] VARCHAR(12),
	[customs_value_minor] BIGINT,
	[duty_minor] BIGINT,
	[vat_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[status] VARCHAR(24) NOT NULL DEFAULT 'draft',
	[submitted_at] DATETIME2,
	[cleared_at] DATETIME2,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A filing with one authority. It is per shipment and per country rather than per booking, because export and import clearances are independent processes with independent failure modes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipment being declared.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'shipment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'export | import | transit. One shipment normally has at least two, filed in different countries by different brokers.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'declaration_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO country the declaration is filed in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'country_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Office of entry or exit, which decides where the goods must physically present.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'customs_office_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Movement reference number issued by the authority once accepted. Null while the entry is still being prepared.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'declaration_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Harmonised System commodity code, the six to ten digits that decide the duty rate.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'hs_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Declared value in minor units, the base the duty is calculated from.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'customs_value_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Duty assessed in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'duty_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Import tax assessed in minor units. Separate from duty because they are reclaimable under different rules.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'vat_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the three money columns.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'draft | submitted | query | cleared | rejected. query is the state that costs money, because storage accrues while it lasts.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the entry was filed, in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'submitted_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When release was granted. The gap from arrival is the dwell time customers complain about.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'customs_declarations',
    @level2type=N'COLUMN',@level2name=N'cleared_at';
GO

CREATE INDEX [IX_customs_shipment_type]
ON [customs_declarations] ([shipment_id], [declaration_type]);
GO

CREATE INDEX [IX_customs_status]
ON [customs_declarations] ([status]);
GO

CREATE TABLE [documents] (
	[id] BIGINT IDENTITY,
	[shipment_id] BIGINT NOT NULL,
	[document_type] VARCHAR(32) NOT NULL,
	[document_number] VARCHAR(60),
	[storage_key] VARCHAR(400) NOT NULL,
	[content_type] VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
	[file_hash] BINARY(32),
	[is_original] BIT NOT NULL DEFAULT 0,
	[issued_at] DATETIME2,
	[released_at] DATETIME2,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Pointers to the paperwork, not the paperwork itself. Release timing is modelled because holding documents until payment is the leverage the whole business runs on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipment the document belongs to.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'shipment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'master_bill | house_bill | air_waybill | commercial_invoice | packing_list | certificate_of_origin | dangerous_goods | insurance. The type decides who may see it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'document_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Number printed on the document, if it carries one.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'document_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Object storage key for the PDF or image. The file itself never goes in the database; a varbinary column here would make every backup ten times its necessary size.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'storage_key';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'MIME type, so the portal serves it correctly instead of guessing from the extension.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'content_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'SHA-256 of the stored bytes. It is how you prove the bill of lading a client downloaded is the one you issued.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'file_hash';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 1 for an original negotiable bill of lading. Originals are title to the goods; a copy is not, and conflating them releases cargo to the wrong party.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'is_original';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When it was issued, in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'issued_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When it was released to the client, typically after payment. Null means the forwarder is still holding title.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'documents',
    @level2type=N'COLUMN',@level2name=N'released_at';
GO

CREATE INDEX [IX_documents_shipment_type]
ON [documents] ([shipment_id], [document_type]);
GO

CREATE TABLE [charges] (
	[id] BIGINT IDENTITY,
	[shipment_id] BIGINT NOT NULL,
	[leg_id] BIGINT,
	[invoice_id] BIGINT,
	[charge_code] VARCHAR(24) NOT NULL,
	[charge_basis] VARCHAR(16) NOT NULL DEFAULT 'per_shipment',
	[quantity] DECIMAL(12,3) NOT NULL DEFAULT 1,
	[cost_minor] BIGINT NOT NULL DEFAULT 0,
	[sell_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[exchange_rate] DECIMAL(18,8),
	[is_billable] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One row per cost and revenue line. Buy and sell sit side by side because a forwarder earns the spread, not the freight, and a schema that separates them turns the core metric into a nightly job.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Shipment the charge belongs to.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'shipment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Leg it relates to, where it relates to one. Null for shipment-wide charges such as documentation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'leg_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Invoice this charge was billed on. Null means unbilled, and the unbilled set is the work-in-progress every forwarder watches.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'invoice_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ocean_freight | thc | bunker_surcharge | customs_clearance | demurrage | detention | documentation | insurance. A code rather than free text, because margin is analysed per code.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'charge_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'per_container | per_kg | per_cbm | per_shipment | percentage. Must match how the underlying rate was quoted or the recalculation will not reconcile.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'charge_basis';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Units of charge_basis, for example two containers or 1,450.5 chargeable kilos.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'quantity';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the carrier or vendor charges, in minor units. Buy side.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the client is charged, in minor units. Sell side. Keeping both on one row is what makes margin per shipment a subtraction rather than a reconciliation project.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'sell_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of both amounts.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Rate to the invoicing currency, snapshotted when the charge was raised. Without it a revalued invoice cannot be explained to the client or the auditor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'exchange_rate';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set to 0 for costs absorbed by the forwarder, such as a demurrage charge caused by its own delay. Absorbed cost must still be recorded or margin is fiction.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'charges',
    @level2type=N'COLUMN',@level2name=N'is_billable';
GO

CREATE INDEX [IX_charges_shipment_code]
ON [charges] ([shipment_id], [charge_code]);
GO

CREATE INDEX [IX_charges_invoice]
ON [charges] ([invoice_id]);
GO

CREATE TABLE [invoices] (
	[id] BIGINT IDENTITY,
	[client_id] BIGINT NOT NULL,
	[booking_id] BIGINT,
	[invoice_number] VARCHAR(24) NOT NULL UNIQUE,
	[status] VARCHAR(24) NOT NULL DEFAULT 'draft',
	[issued_on] DATE,
	[due_on] DATE,
	[subtotal_minor] BIGINT NOT NULL DEFAULT 0,
	[tax_minor] BIGINT NOT NULL DEFAULT 0,
	[total_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The billing document. Totals are snapshotted rather than summed on read, because an issued invoice is a legal artefact that must render identically in five years even if every charge under it has been reclassified.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Party billed. Not necessarily the shipper or consignee on the transport document.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'client_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Booking billed, where the invoice covers exactly one. Null for a consolidated monthly invoice spanning many.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'booking_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sequential legal document number. Gaps in the sequence are a tax problem, so numbers are allocated on issue, never on draft.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'invoice_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'draft | issued | part_paid | paid | credited | written_off. An issued invoice is immutable; a correction is a credit note referencing it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tax point date. Null while draft.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'issued_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payment due date, derived from the client credit terms at issue.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'due_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of the billed charge lines in minor units, stored so a reissued invoice cannot silently change when a charge is edited.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'subtotal_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tax in minor units. Cross-border freight is frequently zero-rated, which is a fact about the shipment, not a rounding.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'tax_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Total payable in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'total_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the invoice, which can differ from the currency of its charges.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'invoices',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

CREATE INDEX [IX_invoices_client_status]
ON [invoices] ([client_id], [status]);
GO

CREATE INDEX [IX_invoices_issued]
ON [invoices] ([issued_on]);
GO


ALTER TABLE [rate_contracts]
ADD FOREIGN KEY([carrier_id])
REFERENCES [carriers]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [bookings]
ADD FOREIGN KEY([client_id])
REFERENCES [clients]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [shipments]
ADD FOREIGN KEY([booking_id])
REFERENCES [bookings]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [shipment_containers]
ADD FOREIGN KEY([shipment_id])
REFERENCES [shipments]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [shipment_containers]
ADD FOREIGN KEY([container_id])
REFERENCES [containers]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [shipment_legs]
ADD FOREIGN KEY([shipment_id])
REFERENCES [shipments]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [shipment_legs]
ADD FOREIGN KEY([carrier_id])
REFERENCES [carriers]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [leg_events]
ADD FOREIGN KEY([leg_id])
REFERENCES [shipment_legs]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [customs_declarations]
ADD FOREIGN KEY([shipment_id])
REFERENCES [shipments]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [documents]
ADD FOREIGN KEY([shipment_id])
REFERENCES [shipments]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [charges]
ADD FOREIGN KEY([shipment_id])
REFERENCES [shipments]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [charges]
ADD FOREIGN KEY([leg_id])
REFERENCES [shipment_legs]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [charges]
ADD FOREIGN KEY([invoice_id])
REFERENCES [invoices]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [invoices]
ADD FOREIGN KEY([client_id])
REFERENCES [clients]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [invoices]
ADD FOREIGN KEY([booking_id])
REFERENCES [bookings]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
