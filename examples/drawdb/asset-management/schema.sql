CREATE TABLE [vendors] (
	[id] BIGINT IDENTITY,
	[vendor_code] NVARCHAR(24) NOT NULL UNIQUE,
	[name] NVARCHAR(200) NOT NULL,
	[vendor_kind] NVARCHAR(24) NOT NULL DEFAULT 'reseller',
	[support_email] NVARCHAR(320),
	[support_phone] NVARCHAR(32),
	[account_number] NVARCHAR(64),
	[is_active] BIT NOT NULL DEFAULT 1,
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whoever the company buys from, leases from or claims against. One table for all three because a warranty claim, a licence renewal and a repair invoice all need the same escalation details.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Short code shared with finance so a purchase order can be matched to an asset without a name lookup.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'vendor_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Legal or trading name of the supplier.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'manufacturer | reseller | service_provider | leasing. The same company often plays two roles, which is why this describes the relationship rather than the company.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'vendor_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Address used to raise a warranty or support claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'support_email';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Escalation number, which is what you actually need at the point a server is down.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'support_phone';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Customer account held with this vendor, quoted on every claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'account_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Retired vendors stay as rows because historical purchases, contracts and maintenance still point at them.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Row creation in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'vendors',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE TABLE [employees] (
	[id] BIGINT IDENTITY,
	[employee_number] NVARCHAR(24) NOT NULL UNIQUE,
	[display_name] NVARCHAR(200) NOT NULL,
	[work_email] NVARCHAR(320) NOT NULL UNIQUE,
	[department_code] NVARCHAR(16),
	[office_location] NVARCHAR(120),
	[employment_status] NVARCHAR(24) NOT NULL DEFAULT 'active',
	[offboarded_on] DATE,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A local mirror of the staff directory, kept deliberately thin. It exists so assignments have a real foreign key rather than a free-text name, not to be a second HR database.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Staff number from the HR system. The join key for a directory sync, and stable across name changes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'employee_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Name as shown in asset reports and on handover receipts.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'display_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Company address, used to notify someone that an asset is assigned to them or overdue for return.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'work_email';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cost centre the asset expense is charged to. Denormalised from HR because the charge follows the assignment, not the person.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'department_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Primary site. Drives which audit cycle an assigned asset falls into.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'office_location';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'active | on_leave | terminated. A termination is what triggers the recovery workflow for every open assignment.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'employment_status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last working day. Null while employed. Assets still assigned after this date are the most common source of loss.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'offboarded_on';
GO

CREATE INDEX [idx_employees_status_offboarded]
ON [employees] ([employment_status], [offboarded_on]);
GO

CREATE TABLE [asset_models] (
	[id] BIGINT IDENTITY,
	[model_code] NVARCHAR(48) NOT NULL UNIQUE,
	[manufacturer] NVARCHAR(120) NOT NULL,
	[model_name] NVARCHAR(160) NOT NULL,
	[category] NVARCHAR(40) NOT NULL,
	[specification] JSON,
	[default_useful_life_months] SMALLINT NOT NULL DEFAULT 36,
	[standard_cost_minor] BIGINT,
	[currency_code] CHAR(3),
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What a thing is, independent of any particular one. Separating the model from the asset is what makes a fleet report — how many of this laptop do we own, how old are they — a grouping rather than a string match on a description field.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Manufacturer part number or internal catalogue code, the thing procurement actually orders against.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'model_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who makes it. Separate from the vendor, because the same laptop is bought through three resellers.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'manufacturer';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Marketing name staff recognise.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'model_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'laptop | desktop | monitor | phone | server | network | peripheral. Drives the default useful life and the audit frequency.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'category';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Configuration as captured at catalogue time — CPU, memory, storage. Semi-structured because every category has different attributes and none of them are queried in a join.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'specification';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Expected life used to seed a depreciation schedule. A default, not a rule: the schedule on the individual asset is what accounting reads.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'default_useful_life_months';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Typical purchase price in minor units, for budgeting. The real price lives on the asset, since it varies per order.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'standard_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency the standard cost is quoted in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the model can still be ordered. Existing assets keep referring to discontinued models.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_models',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE INDEX [idx_models_category_active]
ON [asset_models] ([category], [is_active]);
GO

CREATE TABLE [assets] (
	[id] BIGINT IDENTITY,
	[asset_tag] NVARCHAR(32) NOT NULL UNIQUE,
	[model_id] BIGINT NOT NULL,
	[vendor_id] BIGINT,
	[serial_number] NVARCHAR(96),
	[status] NVARCHAR(24) NOT NULL DEFAULT 'in_stock',
	[condition_grade] NVARCHAR(16) NOT NULL DEFAULT 'good',
	[purchase_order] NVARCHAR(64),
	[purchase_date] DATE,
	[purchase_cost_minor] BIGINT,
	[currency_code] CHAR(3),
	[ownership] NVARCHAR(16) NOT NULL DEFAULT 'owned',
	[current_location] NVARCHAR(120),
	[last_seen_at] DATETIME2(3),
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One physical thing, tracked from purchase to disposal. It is never deleted: a lost or scrapped laptop still has to appear in the depreciation schedule and in last year audit results.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The barcode label physically stuck on the device. This, not the serial number, is what an auditor scans.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'asset_tag';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Catalogue entry this unit is an instance of.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'model_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who it was bought from. Null for assets inherited through an acquisition, which is a real and messy case.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'vendor_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Manufacturer serial. Unique in practice but nullable, because cheap peripherals often have none and a tag is still needed.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'serial_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'in_stock | assigned | in_repair | lost | retired | disposed. The status is derived from the other tables but stored, because every list view filters on it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'new | good | fair | poor. Set at each audit and at each return, and it is what decides refurbish versus dispose.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'condition_grade';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Purchase order reference, the bridge to the finance system.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'purchase_order';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Invoice date. Depreciation and warranty both count from here, not from the day IT unboxed it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'purchase_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Actual price paid in minor units, which is the depreciable base.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'purchase_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the purchase.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'owned | leased | loaned. A leased asset must never be disposed of, only returned, so this gates the disposal workflow.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'ownership';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Site or room where it was last seen. Updated by audits, which is the only reliable source for it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'current_location';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Most recent confirmed sighting, from an audit scan or a management agent check-in. Age of this value is the practical definition of a missing asset.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'last_seen_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the asset entered the register.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'assets',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [idx_assets_status_model]
ON [assets] ([status], [model_id]);
GO

CREATE INDEX [idx_assets_serial]
ON [assets] ([serial_number]);
GO

CREATE TABLE [asset_assignments] (
	[id] BIGINT IDENTITY,
	[asset_id] BIGINT NOT NULL,
	[employee_id] BIGINT,
	[assigned_location] NVARCHAR(120),
	[assignment_kind] NVARCHAR(24) NOT NULL DEFAULT 'permanent',
	[assigned_on] DATE NOT NULL,
	[due_back_on] DATE,
	[returned_on] DATE,
	[return_condition] NVARCHAR(16),
	[acknowledged_at] DATETIME2(3),
	[notes] NVARCHAR(400),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Custody over time, one row per period of possession. Keeping it as history rather than a holder column on the asset is what lets you answer who had this machine when the data leaked.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset handed out.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Person holding it. Null when the asset is assigned to a location or a shared pool rather than an individual.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Room or site, for shared equipment such as a meeting-room display that has no personal owner.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'assigned_location';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'permanent | loaner | temporary. A loaner carries a due date and appears on the overdue report; a permanent assignment does not.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'assignment_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date of handover, which is when responsibility transfers.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'assigned_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Expected return date for a loaner. Null for a permanent assignment.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'due_back_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Actual return date. Null while held. An open row with an offboarded employee is the definition of an unrecovered asset.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'returned_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'new | good | fair | poor | damaged, recorded at handback. Damage here is what justifies a chargeback.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'return_condition';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the holder accepted the handover receipt. Unacknowledged assignments are worth chasing before a device goes missing rather than after.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'acknowledged_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Free text for the circumstances, mostly used on early returns and disputes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'asset_assignments',
    @level2type=N'COLUMN',@level2name=N'notes';
GO

CREATE INDEX [idx_assignments_asset_date]
ON [asset_assignments] ([asset_id], [assigned_on]);
GO

CREATE INDEX [idx_assignments_employee_open]
ON [asset_assignments] ([employee_id], [returned_on]);
GO

CREATE TABLE [software_licences] (
	[id] BIGINT IDENTITY,
	[licence_key_reference] NVARCHAR(64) NOT NULL UNIQUE,
	[product_name] NVARCHAR(160) NOT NULL,
	[edition] NVARCHAR(80),
	[vendor_id] BIGINT NOT NULL,
	[licence_model] NVARCHAR(24) NOT NULL DEFAULT 'per_seat',
	[seats_entitled] INTEGER NOT NULL DEFAULT 0,
	[seats_allocated] INTEGER NOT NULL DEFAULT 0,
	[unit_cost_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL,
	[term_start] DATE NOT NULL,
	[term_end] DATE,
	[auto_renew] BIT NOT NULL DEFAULT 0,
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'An entitlement, not an installation. Compliance is the comparison between seats_entitled here and the live rows in licence_allocations, which is why a licence is never modelled as a flag on an asset.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Reference to the entitlement in the vendor portal. The key material itself stays in the secret store, not in a reporting database.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'licence_key_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Software product as the vendor names it on the invoice.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'product_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Edition or tier, since entitlements differ sharply between them.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'edition';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Publisher or reseller the entitlement was bought from and who audits it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'vendor_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'per_seat | per_device | site | concurrent | subscription. This decides what an allocation row means, so every compliance calculation branches on it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'licence_model';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Seats purchased. Zero for a site licence, where compliance is a different question entirely.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'seats_entitled';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cached count of active allocations, maintained alongside the allocation rows. The rows are the source of truth; this exists so the compliance dashboard is one scan rather than a join over every allocation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'seats_allocated';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cost per seat per term in minor units, used to price the gap when you are under-licensed.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'unit_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the agreement.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of the entitlement period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'term_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of the entitlement period. Null for a perpetual licence, which is exactly what distinguishes perpetual from subscription.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'term_end';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the agreement renews unless cancelled. The unpleasant surprises in software spend all live behind this bit.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'auto_renew';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Expired agreements are kept because an audit covers periods, not the present.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'software_licences',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE INDEX [idx_licences_vendor_term]
ON [software_licences] ([vendor_id], [term_end]);
GO

CREATE TABLE [licence_allocations] (
	[id] BIGINT IDENTITY,
	[licence_id] BIGINT NOT NULL,
	[employee_id] BIGINT,
	[asset_id] BIGINT,
	[allocated_on] DATE NOT NULL,
	[released_on] DATE,
	[install_detected_at] DATETIME2(3),
	[notes] NVARCHAR(400),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One seat, held for a period. Releases are dated rather than deleted so that a vendor audit covering last year can be answered with the allocations that were live then, not the ones live today.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Entitlement a seat is drawn from.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'licence_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Person the seat is assigned to, for a per-seat model. Null for per-device licensing.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Device the seat is tied to, for a per-device model. Null for per-seat licensing. Exactly one of this and employee_id is set, decided by the licence model.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the seat was consumed. A seat consumed mid-term still costs a full term, which is why this is worth reporting on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'allocated_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the seat was freed. Null while consumed. Only rows with this null count toward seats_allocated.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'released_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When inventory scanning last saw the software actually installed. A gap between an allocation and a detection is shelfware; a detection with no allocation is an unlicensed install.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'install_detected_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Free text, typically the ticket that requested the seat.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'licence_allocations',
    @level2type=N'COLUMN',@level2name=N'notes';
GO

CREATE INDEX [idx_allocations_licence_open]
ON [licence_allocations] ([licence_id], [released_on]);
GO

CREATE INDEX [idx_allocations_employee_licence]
ON [licence_allocations] ([employee_id], [licence_id]);
GO

CREATE TABLE [support_contracts] (
	[id] BIGINT IDENTITY,
	[contract_reference] NVARCHAR(64) NOT NULL UNIQUE,
	[vendor_id] BIGINT NOT NULL,
	[asset_id] BIGINT,
	[model_id] BIGINT,
	[coverage_kind] NVARCHAR(24) NOT NULL DEFAULT 'warranty',
	[service_level] NVARCHAR(40),
	[starts_on] DATE NOT NULL,
	[ends_on] DATE NOT NULL,
	[cost_minor] BIGINT,
	[currency_code] CHAR(3),
	[auto_renew] BIT NOT NULL DEFAULT 0,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cover, attachable either to one asset or to a whole model. Both shapes exist in real purchasing, and forcing one of them into the other is how a fleet contract ends up duplicated across four hundred rows.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contract number quoted when opening a claim with the vendor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'contract_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Party carrying the obligation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'vendor_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset covered, for a per-device warranty. Null for a fleet-wide contract that covers a category instead.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Model covered, when the contract is fleet-wide rather than per device.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'model_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'warranty | extended_warranty | support | maintenance. A warranty comes with the purchase, a support contract is bought and renewed separately.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'coverage_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Response commitment such as next_business_day or four_hour_onsite. Text because vendors invent their own names for this.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'service_level';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of cover.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'starts_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of cover. The renewal report is a query on this column and nothing else.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'ends_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contract cost in minor units, for the renew-or-replace calculation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the contract.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether cover continues unless cancelled.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'support_contracts',
    @level2type=N'COLUMN',@level2name=N'auto_renew';
GO

CREATE INDEX [idx_contracts_ends_kind]
ON [support_contracts] ([ends_on], [coverage_kind]);
GO

CREATE INDEX [idx_contracts_asset]
ON [support_contracts] ([asset_id]);
GO

CREATE TABLE [maintenance_events] (
	[id] BIGINT IDENTITY,
	[asset_id] BIGINT NOT NULL,
	[vendor_id] BIGINT,
	[support_contract_id] BIGINT,
	[event_kind] NVARCHAR(24) NOT NULL DEFAULT 'repair',
	[reported_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	[started_at] DATETIME2(3),
	[completed_at] DATETIME2(3),
	[downtime_hours] DECIMAL(8,2),
	[cost_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3),
	[resolution] NVARCHAR(400),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Every intervention on an asset. Accumulated repair cost against remaining book value is the whole basis of a replace-or-repair decision, and neither number exists unless the work is recorded here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset worked on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who performed the work. Null when it was done in house.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'vendor_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contract the work was claimed under. Null when the work was billed directly, which is exactly the case the renewal decision needs to see.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'support_contract_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'repair | preventive | upgrade | inspection | reimage. Preventive work on a schedule and reactive repairs have very different cost stories.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'event_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the fault was raised.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'reported_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When work began. The gap from reported_at is the vendor response time actually delivered, against what the service level promised.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'started_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the asset returned to service. Null while open.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'completed_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Hours the asset was unusable. Stored rather than derived because a repaired laptop often sits on a shelf before it is handed back.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'downtime_hours';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Out-of-pocket cost in minor units. Zero under warranty, which is how the value of a contract gets measured.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the cost.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What was actually done. The cheapest possible input to a repeat-failure analysis.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'maintenance_events',
    @level2type=N'COLUMN',@level2name=N'resolution';
GO

CREATE INDEX [idx_maintenance_asset_reported]
ON [maintenance_events] ([asset_id], [reported_at]);
GO

CREATE TABLE [depreciation_schedules] (
	[id] BIGINT IDENTITY,
	[asset_id] BIGINT NOT NULL,
	[period_start] DATE NOT NULL,
	[period_end] DATE NOT NULL,
	[method] NVARCHAR(24) NOT NULL DEFAULT 'straight_line',
	[opening_value_minor] BIGINT NOT NULL,
	[depreciation_minor] BIGINT NOT NULL,
	[closing_value_minor] BIGINT NOT NULL,
	[currency_code] CHAR(3) NOT NULL,
	[is_posted] BIT NOT NULL DEFAULT 0,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One row per asset per accounting period. Precomputing the schedule rather than deriving book value from a formula means an early disposal or an impairment can stop and restate future periods without breaking the ones already posted.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset being depreciated.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of the accounting period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'period_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of the accounting period, and the grouping key finance posts on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'period_end';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'straight_line | declining_balance | units_of_production. Stored per row so a change in policy applies from a date forward rather than rewriting history.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'method';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Book value carried into the period, in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'opening_value_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Charge for the period, in minor units. Always positive; the direction is implied.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'depreciation_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Book value carried out. Must equal opening less the charge, which makes the schedule self-checking.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'closing_value_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency, matching the purchase currency.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the charge has been journaled to finance. Posted rows are frozen; an adjustment is a later row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'depreciation_schedules',
    @level2type=N'COLUMN',@level2name=N'is_posted';
GO

CREATE UNIQUE INDEX [uq_depreciation_asset_period]
ON [depreciation_schedules] ([asset_id], [period_end]);
GO

CREATE TABLE [audits] (
	[id] BIGINT IDENTITY,
	[audit_reference] NVARCHAR(32) NOT NULL UNIQUE,
	[scope_location] NVARCHAR(120),
	[scope_category] NVARCHAR(40),
	[status] NVARCHAR(24) NOT NULL DEFAULT 'planned',
	[started_on] DATE,
	[completed_on] DATE,
	[expected_count] INTEGER NOT NULL DEFAULT 0,
	[sighted_count] INTEGER NOT NULL DEFAULT 0,
	[conducted_by_employee_id] BIGINT,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A counting exercise with a defined scope and window. Modelled as its own entity rather than as a timestamp on assets, because the interesting output is the discrepancy list, and a list needs a parent.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Quotable identifier for the audit cycle.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'audit_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Site being audited. Null for a company-wide sweep.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'scope_location';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset category in scope. Null means all categories.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'scope_category';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'planned | in_progress | completed | cancelled. Findings only become actionable once the audit completes, since an in-progress sweep has not yet found the assets it is about to scan.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First scan date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'started_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last scan date. Everything not sighted between the start and this date is a discrepancy by definition.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'completed_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Assets the register said were in scope when the audit opened. Frozen at that moment, so late additions do not distort the hit rate.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'expected_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Assets physically confirmed. The ratio against expected_count is the number the audit is actually judged on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'sighted_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who ran it. Null for an automated sweep driven by management agent check-ins.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audits',
    @level2type=N'COLUMN',@level2name=N'conducted_by_employee_id';
GO

CREATE TABLE [audit_findings] (
	[id] BIGINT IDENTITY,
	[audit_id] BIGINT NOT NULL,
	[asset_id] BIGINT,
	[finding_kind] NVARCHAR(32) NOT NULL,
	[expected_value] NVARCHAR(200),
	[observed_value] NVARCHAR(200),
	[severity] NVARCHAR(16) NOT NULL DEFAULT 'medium',
	[status] NVARCHAR(24) NOT NULL DEFAULT 'open',
	[resolved_on] DATE,
	[resolution_notes] NVARCHAR(400),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One discrepancy between the register and reality. Findings persist after resolution because a machine that goes missing in three consecutive audits is telling you something a corrected record no longer would.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Audit that produced the finding.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'audit_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset concerned. Null for an unregistered device found on site, which is the finding with no row to point at.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'not_found | wrong_location | wrong_holder | unregistered | condition_changed | duplicate_tag. Each one implies a different correction, so it is a category rather than a note.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'finding_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the register said — location, holder or condition.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'expected_value';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the auditor actually saw. Keeping both sides means the finding still makes sense after the register is corrected.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'observed_value';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'low | medium | high. High is reserved for anything that could be a loss of data rather than of hardware.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'severity';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'open | investigating | resolved | written_off. A write-off is a resolution, not a deletion.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the discrepancy was closed out. Null while open.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'resolved_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'How it was settled. The audit trail for a write-off lives here and nowhere else.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'audit_findings',
    @level2type=N'COLUMN',@level2name=N'resolution_notes';
GO

CREATE INDEX [idx_findings_audit_kind]
ON [audit_findings] ([audit_id], [finding_kind]);
GO

CREATE INDEX [idx_findings_status_severity]
ON [audit_findings] ([status], [severity]);
GO

CREATE TABLE [disposals] (
	[id] BIGINT IDENTITY,
	[asset_id] BIGINT NOT NULL UNIQUE,
	[disposal_method] NVARCHAR(24) NOT NULL,
	[disposed_on] DATE NOT NULL,
	[vendor_id] BIGINT,
	[proceeds_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3),
	[book_value_at_disposal_minor] BIGINT,
	[data_wiped_at] DATETIME2(3),
	[wipe_certificate_reference] NVARCHAR(96),
	[approved_by_employee_id] BIGINT,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The end of the asset lifecycle, recorded rather than deleted. The row exists mainly to hold the two facts somebody will eventually ask for: what happened to the money, and what happened to the data.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Asset disposed of. Unique because an asset leaves the estate exactly once, and this constraint is what enforces it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'asset_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'resale | recycle | donation | destruction | lease_return | write_off. A leased asset can only ever be a lease return, which is checked against the ownership on the asset.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'disposal_method';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the asset physically left. Depreciation stops here and any remaining book value becomes a loss on disposal.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'disposed_on';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Recycler, buyer or lessor. Null for internal destruction.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'vendor_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Amount recovered in minor units. Zero for recycling, negative outcomes are handled as a disposal cost in finance rather than here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'proceeds_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the proceeds.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Remaining book value at the disposal date, snapshotted so the gain or loss is reproducible without replaying the schedule.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'book_value_at_disposal_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When storage was sanitised. Null here on a device that held data is a reportable gap, which is why it is a timestamp and not a bit.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'data_wiped_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Certificate identifier from the sanitisation tool or vendor. The evidence a regulator asks for.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'wipe_certificate_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who authorised the disposal. Null only for migrated historical records.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'disposals',
    @level2type=N'COLUMN',@level2name=N'approved_by_employee_id';
GO

CREATE INDEX [idx_disposals_date_method]
ON [disposals] ([disposed_on], [disposal_method]);
GO


ALTER TABLE [assets]
ADD FOREIGN KEY([model_id])
REFERENCES [asset_models]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [assets]
ADD FOREIGN KEY([vendor_id])
REFERENCES [vendors]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [asset_assignments]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [asset_assignments]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [software_licences]
ADD FOREIGN KEY([vendor_id])
REFERENCES [vendors]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [licence_allocations]
ADD FOREIGN KEY([licence_id])
REFERENCES [software_licences]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [licence_allocations]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [licence_allocations]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [support_contracts]
ADD FOREIGN KEY([vendor_id])
REFERENCES [vendors]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [support_contracts]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [support_contracts]
ADD FOREIGN KEY([model_id])
REFERENCES [asset_models]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [maintenance_events]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [maintenance_events]
ADD FOREIGN KEY([vendor_id])
REFERENCES [vendors]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [maintenance_events]
ADD FOREIGN KEY([support_contract_id])
REFERENCES [support_contracts]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [depreciation_schedules]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [audits]
ADD FOREIGN KEY([conducted_by_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [audit_findings]
ADD FOREIGN KEY([audit_id])
REFERENCES [audits]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [audit_findings]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [disposals]
ADD FOREIGN KEY([asset_id])
REFERENCES [assets]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [disposals]
ADD FOREIGN KEY([vendor_id])
REFERENCES [vendors]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [disposals]
ADD FOREIGN KEY([approved_by_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
