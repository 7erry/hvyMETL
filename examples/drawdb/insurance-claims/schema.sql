CREATE TABLE [plans] (
	[plan_id] BIGINT IDENTITY,
	[plan_code] NVARCHAR(32) NOT NULL UNIQUE,
	[plan_name] NVARCHAR(160) NOT NULL,
	[plan_type] NVARCHAR(16) NOT NULL,
	[plan_year] SMALLINT NOT NULL,
	[individual_deductible_minor] BIGINT NOT NULL DEFAULT 0,
	[family_deductible_minor] BIGINT NOT NULL DEFAULT 0,
	[out_of_pocket_max_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([plan_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A benefit product for one plan year. Reissued annually rather than amended in place, so a claim received in March for a service last December is priced against the design that was actually sold.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'plan_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Code printed on the member card and quoted on every enquiry.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'plan_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Marketing name of the product.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'plan_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'HMO | PPO | EPO | POS. Decides whether out-of-network care is covered at all.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'plan_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Benefit year the design belongs to. A plan is reissued each year rather than edited, because accumulators reset with it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'plan_year';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Annual deductible per member, in minor units. Integer money — cents never rounds against you the way a float does.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'individual_deductible_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Annual deductible across the whole policy.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'family_deductible_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cap after which the plan pays everything. The stopping condition of the adjudication arithmetic.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'out_of_pocket_max_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency for every amount on the row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of the benefit year.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day. Null only for an open-ended plan, which is rare.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cleared when the product is withdrawn. Never deleted, because claims for prior years still adjudicate against it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'plans',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE UNIQUE INDEX [UQ_plans_code_year]
ON [plans] ([plan_code], [plan_year]);
GO

CREATE TABLE [benefit_rules] (
	[benefit_rule_id] BIGINT IDENTITY,
	[plan_id] BIGINT NOT NULL,
	[service_category] NVARCHAR(60) NOT NULL,
	[place_of_service] NVARCHAR(8),
	[network_tier] NVARCHAR(20) NOT NULL DEFAULT 'in_network',
	[copay_minor] BIGINT,
	[coinsurance_percent] DECIMAL(5,2),
	[applies_to_deductible] BIT NOT NULL DEFAULT 1,
	[requires_prior_authorization] BIT NOT NULL DEFAULT 0,
	[annual_visit_limit] SMALLINT,
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	PRIMARY KEY([benefit_rule_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The benefit design expressed as data. Adjudication is a lookup here rather than a branch in code, which is what lets a new plan ship without a release and a past decision be re-explained exactly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'benefit_rule_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plan the rule belongs to.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'plan_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Benefit category, e.g. office_visit, inpatient, imaging, behavioral_health.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'service_category';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'CMS place-of-service code the rule is restricted to. Null applies it everywhere.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'place_of_service';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'in_network | out_of_network. The same category is nearly always two rules, and conflating them is the classic adjudication bug.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'network_tier';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Flat amount the member pays per encounter, in minor units. Null when the benefit is coinsurance-only.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'copay_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Member share after deductible, as a percentage. Null when the benefit is copay-only.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'coinsurance_percent';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cleared for services covered before the deductible is met, such as preventive care.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'applies_to_deductible';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set for services that deny automatically without an authorisation on file.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'requires_prior_authorization';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cap on covered encounters per year, e.g. twenty physiotherapy visits. Null is unlimited.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'annual_visit_limit';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day the rule applies, so a mid-year amendment is a new row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day. Null while current.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_rules',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

CREATE INDEX [IX_benefit_rules_lookup]
ON [benefit_rules] ([plan_id], [service_category], [network_tier], [effective_from]);
GO

CREATE TABLE [policies] (
	[policy_id] BIGINT IDENTITY,
	[plan_id] BIGINT NOT NULL,
	[policy_number] NVARCHAR(40) NOT NULL UNIQUE,
	[group_number] NVARCHAR(40),
	[group_name] NVARCHAR(160),
	[subscriber_member_id] BIGINT,
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	[status] NVARCHAR(20) NOT NULL DEFAULT 'active',
	[premium_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	PRIMARY KEY([policy_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The contract between the payer and a subscriber. Terminated policies are retained indefinitely, because claims arrive for months after coverage ends and each is judged against the dates on this row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'policy_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plan purchased.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'plan_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contract number quoted on every claim and call.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'policy_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Employer group identifier. Null for individual market policies.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'group_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Employer name, used on the explanation of benefits.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'group_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The member who holds the contract. Nullable only because the policy row is written a moment before its subscriber.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'subscriber_member_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Coverage start.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Coverage end. Null while active. A claim is adjudicated against the policy in force on the service date, not today.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'active | lapsed | terminated | grace. grace matters because claims in a grace period are pended rather than denied.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Monthly premium in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'premium_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of premium_minor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'policies',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

CREATE INDEX [IX_policies_group]
ON [policies] ([group_number]);
GO

CREATE TABLE [members] (
	[member_id] BIGINT IDENTITY,
	[policy_id] BIGINT NOT NULL,
	[member_number] NVARCHAR(40) NOT NULL,
	[relationship] NVARCHAR(16) NOT NULL,
	[given_name] NVARCHAR(100) NOT NULL,
	[family_name] NVARCHAR(100) NOT NULL,
	[date_of_birth] DATE NOT NULL,
	[sex] CHAR(1),
	[coverage_start] DATE NOT NULL,
	[coverage_end] DATE,
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([member_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A covered person, subscriber or dependent, in one table. Dependents are not a separate entity: they have their own member number, their own coverage dates and their own claims, and the only thing that distinguishes them is the relationship column.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'member_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Policy that covers this person.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'policy_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Number on the card, usually the subscriber number plus a two-digit suffix per dependent.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'member_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'subscriber | spouse | child | other. Exactly one subscriber per policy; everyone else is a dependent.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'relationship';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First name as enrolled, matched against the name a provider submits.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'given_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surname.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'family_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Identity matching, and the driver of dependent age-out rules.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'date_of_birth';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'M | F | X as enrolled. Used in claim edits where a procedure is sex-specific.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'sex';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When this person joined the policy, which is often later than the policy start.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'coverage_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When they left, for example a dependent ageing out. Null while covered.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'coverage_end';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Fast filter for eligibility checks; the dates remain authoritative.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'members',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE UNIQUE INDEX [UQ_members_number]
ON [members] ([member_number]);
GO

CREATE INDEX [IX_members_policy_relationship]
ON [members] ([policy_id], [relationship]);
GO

CREATE TABLE [providers] (
	[provider_id] BIGINT IDENTITY,
	[npi] NVARCHAR(20) NOT NULL UNIQUE,
	[provider_name] NVARCHAR(200) NOT NULL,
	[provider_type] NVARCHAR(24) NOT NULL,
	[tax_id] NVARCHAR(20),
	[specialty] NVARCHAR(80),
	[address_line] NVARCHAR(255),
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([provider_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Anyone who bills. Network participation is deliberately not a column here — a provider is in-network for some plans and not others, which is a relationship rather than a property.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'provider_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'National provider identifier submitted on the claim. The join key between the payer world and the provider world.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'npi';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Legal name as registered.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'provider_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'individual | group | facility. A facility claim adjudicates on different rules from a professional one.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'provider_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tax identification number, used on remittance and year-end reporting.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'tax_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Primary specialty, used in edits that restrict procedures to certain specialties.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'specialty';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Service location, which affects pricing in geographically adjusted fee schedules.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'address_line';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cleared when the provider stops billing. Retained because payments and claims point here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'providers',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE TABLE [provider_network_status] (
	[network_status_id] BIGINT IDENTITY,
	[provider_id] BIGINT NOT NULL,
	[plan_id] BIGINT NOT NULL,
	[network_tier] NVARCHAR(20) NOT NULL,
	[contract_code] NVARCHAR(40),
	[fee_schedule_code] NVARCHAR(40),
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	PRIMARY KEY([network_status_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Participation over time, per plan. This table is the reason a claim snapshots its tier: a provider who left the network in June must still be paid at in-network rates for care given in May.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'network_status_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Provider whose participation this describes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'provider_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plan they participate in, or do not.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'plan_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'in_network | out_of_network | tier_2. The single value that decides which benefit rule and which fee schedule apply.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'network_tier';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contract the participation derives from, for provider relations to trace.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'contract_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Fee schedule used to price allowed amounts. Null falls back to the plan default.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'fee_schedule_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Participation start. Dated because contracts are signed and terminated mid-year constantly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Participation end. Null while current.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_network_status',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

CREATE INDEX [IX_network_provider_plan_dates]
ON [provider_network_status] ([provider_id], [plan_id], [effective_from]);
GO

CREATE TABLE [claims] (
	[claim_id] BIGINT IDENTITY,
	[claim_number] NVARCHAR(40) NOT NULL UNIQUE,
	[member_id] BIGINT NOT NULL,
	[policy_id] BIGINT NOT NULL,
	[billing_provider_id] BIGINT NOT NULL,
	[rendering_provider_id] BIGINT,
	[claim_type] NVARCHAR(20) NOT NULL,
	[network_tier] NVARCHAR(20) NOT NULL,
	[received_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	[service_from_date] DATE NOT NULL,
	[service_to_date] DATE NOT NULL,
	[total_billed_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[status] NVARCHAR(20) NOT NULL DEFAULT 'received',
	[adjusted_from_claim_id] BIGINT,
	[payment_id] BIGINT,
	PRIMARY KEY([claim_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The header of a submitted claim. Corrections are represented as new claims chained through adjusted_from_claim_id, which is what makes it possible to show a member why the numbers on their second explanation of benefits differ from the first.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'claim_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payer-assigned number quoted by providers and members. Stable for the life of the claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'claim_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Patient the services were for.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'member_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Policy in force on the service date, snapshotted so later coverage changes cannot re-price a settled claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'policy_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Provider who submitted and who is paid.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'billing_provider_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Clinician who actually delivered the care. Null on facility claims where only the organisation is named.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'rendering_provider_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'professional | institutional | dental | vision | pharmacy. Each has its own edits and its own line format.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'claim_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tier resolved at adjudication and frozen here. Freezing it is what keeps a later contract termination from rewriting history.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'network_tier';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the claim entered the payer. Timely-filing limits and turnaround clocks both start here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'received_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Earliest service date on the claim, and the date coverage and benefits are tested against.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'service_from_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Latest service date on the claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'service_to_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of line charges in minor units, carried on the header so a worklist does not aggregate lines.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'total_billed_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency for all amounts on the claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'received | pended | adjudicated | denied | paid | voided. pended is the state a human has to clear.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The claim this one replaces. Corrections are new claims that point back, never edits, because the original was already reported to the member and the provider.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'adjusted_from_claim_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Remittance the claim was paid on. Null until a payment run picks it up.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claims',
    @level2type=N'COLUMN',@level2name=N'payment_id';
GO

CREATE INDEX [IX_claims_member_service]
ON [claims] ([member_id], [service_from_date]);
GO

CREATE INDEX [IX_claims_worklist]
ON [claims] ([status], [received_at]);
GO

CREATE INDEX [IX_claims_provider_received]
ON [claims] ([billing_provider_id], [received_at]);
GO

CREATE TABLE [claim_lines] (
	[claim_line_id] BIGINT IDENTITY,
	[claim_id] BIGINT NOT NULL,
	[line_number] SMALLINT NOT NULL,
	[service_date] DATE NOT NULL,
	[procedure_code] NVARCHAR(12) NOT NULL,
	[modifier_codes] NVARCHAR(24),
	[diagnosis_code] NVARCHAR(12),
	[place_of_service] NVARCHAR(8),
	[units] DECIMAL(9,2) NOT NULL DEFAULT 1,
	[billed_amount_minor] BIGINT NOT NULL,
	[service_category] NVARCHAR(60),
	PRIMARY KEY([claim_line_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The service line, and the real unit of adjudication. A claim is paid, denied and appealed line by line — one line of a five-line claim can be denied while the rest pay — so every money decision below hangs off this table rather than the header.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'claim_line_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Claim the line belongs to.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'claim_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Position on the submitted claim. Providers and payers discuss claims line by line, so the original numbering has to survive.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'line_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date this specific service was given, which can differ from other lines on the same claim.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'service_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'CPT, HCPCS or revenue code identifying what was done.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'procedure_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Up to four modifiers, comma separated. Modifiers change pricing materially, so they travel with the line.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'modifier_codes';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Primary ICD diagnosis justifying the service. Medical-necessity denials turn on this pairing.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'diagnosis_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'CMS place-of-service code, which selects the benefit rule.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'place_of_service';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Quantity billed. Decimal because anaesthesia and drug units are fractional.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'units';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Provider charge for this line in minor units. Almost never what gets paid.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'billed_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Benefit category the line maps to, resolved at intake so adjudication does not re-derive it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'claim_lines',
    @level2type=N'COLUMN',@level2name=N'service_category';
GO

CREATE UNIQUE INDEX [UQ_claim_lines_claim_line]
ON [claim_lines] ([claim_id], [line_number]);
GO

CREATE INDEX [IX_claim_lines_procedure_date]
ON [claim_lines] ([procedure_code], [service_date]);
GO

CREATE TABLE [adjudications] (
	[adjudication_id] BIGINT IDENTITY,
	[claim_line_id] BIGINT NOT NULL,
	[adjudication_round] SMALLINT NOT NULL DEFAULT 1,
	[benefit_rule_id] BIGINT,
	[network_tier_applied] NVARCHAR(20) NOT NULL,
	[allowed_amount_minor] BIGINT NOT NULL DEFAULT 0,
	[deductible_applied_minor] BIGINT NOT NULL DEFAULT 0,
	[copay_minor] BIGINT NOT NULL DEFAULT 0,
	[coinsurance_minor] BIGINT NOT NULL DEFAULT 0,
	[plan_paid_minor] BIGINT NOT NULL DEFAULT 0,
	[patient_responsibility_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[is_denied] BIT NOT NULL DEFAULT 0,
	[pricing_source] NVARCHAR(40),
	[adjudicated_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([adjudication_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One decision on one line, versioned by round. Adjudication is append-only: reprocessing adds a round instead of overwriting, which is the only way to explain to a member why their share changed after an appeal.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'adjudication_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Line being adjudicated.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'claim_line_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Which pass this is. A reprocessed or appealed line gets a new round rather than an update, so the original decision remains readable.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'adjudication_round';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Rule applied. Null when the line was denied before benefits were reached.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'benefit_rule_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tier actually used in pricing, recorded because it is the first thing questioned in an appeal.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'network_tier_applied';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contracted maximum for the service. The difference from billed is the contractual write-off, which the member never owes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'allowed_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Amount taken from the member remaining deductible.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'deductible_applied_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Flat member charge applied.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'copay_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Percentage share after deductible.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'coinsurance_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the plan pays the provider for this line.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'plan_paid_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Deductible plus copay plus coinsurance. Stored rather than computed so a historical statement always re-renders identically.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'patient_responsibility_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency for all amounts on the row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set when the line pays nothing. The reason lives in denials, because one denial can cite several codes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'is_denied';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Fee schedule or method used, e.g. medicare_rbrvs_2024. Makes a disputed allowed amount traceable.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'pricing_source';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the decision was made.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'adjudications',
    @level2type=N'COLUMN',@level2name=N'adjudicated_at';
GO

CREATE UNIQUE INDEX [UQ_adjudication_line_round]
ON [adjudications] ([claim_line_id], [adjudication_round]);
GO

CREATE INDEX [IX_adjudications_time]
ON [adjudications] ([adjudicated_at]);
GO

CREATE TABLE [denials] (
	[denial_id] BIGINT IDENTITY,
	[adjudication_id] BIGINT NOT NULL,
	[reason_code] NVARCHAR(12) NOT NULL,
	[remark_code] NVARCHAR(12),
	[denial_category] NVARCHAR(40) NOT NULL,
	[description] NVARCHAR(500) NOT NULL,
	[is_appealable] BIT NOT NULL DEFAULT 1,
	[denied_amount_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[denied_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([denial_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Why a line did not pay, as codes rather than prose. Several denials can attach to one adjudication, which is the case a single reason column on the line cannot represent and the case that generates the most provider phone calls.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'denial_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Adjudication round that produced the denial. Pointing at the round, not the line, keeps a reversed denial attached to the decision that made it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'adjudication_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Claim adjustment reason code, e.g. CO-97. The code is what a provider system acts on; the text is decoration.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'reason_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Remittance advice remark code adding detail to the reason.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'remark_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'eligibility | authorization | medical_necessity | coding | timely_filing | duplicate | coordination_of_benefits. The category drives which queue works it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'denial_category';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Member-readable explanation printed on the explanation of benefits.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'description';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cleared for denials with no appeal route, such as a true duplicate.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'is_appealable';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Amount not paid because of this denial, in minor units. Several denials can share a line, so this need not equal the whole charge.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'denied_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of denied_amount_minor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When it was applied. Appeal deadlines run from here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'denials',
    @level2type=N'COLUMN',@level2name=N'denied_at';
GO

CREATE INDEX [IX_denials_category_time]
ON [denials] ([denial_category], [denied_at]);
GO

CREATE INDEX [IX_denials_reason]
ON [denials] ([reason_code]);
GO

CREATE TABLE [appeals] (
	[appeal_id] BIGINT IDENTITY,
	[claim_id] BIGINT NOT NULL,
	[denial_id] BIGINT,
	[appeal_level] NVARCHAR(20) NOT NULL DEFAULT 'first',
	[submitted_by] NVARCHAR(20) NOT NULL,
	[submitted_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	[reason] NVARCHAR(1000) NOT NULL,
	[status] NVARCHAR(20) NOT NULL DEFAULT 'open',
	[decided_at] DATETIME2,
	[decision_notes] NVARCHAR(1000),
	[overturned_amount_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	PRIMARY KEY([appeal_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A formal challenge to a decision. Appeals never mutate the original adjudication — an overturn produces a new round — because the member and the provider were already told the first answer and both versions have to remain explainable.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'appeal_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Claim under appeal, kept at header level because an appeal frequently covers several denied lines.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'claim_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Specific denial being challenged. Null for a general reconsideration request.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'denial_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'first | second | external_review. Each level has its own statutory clock and its own decision maker.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'appeal_level';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'member | provider | representative. Who may appeal is a regulated question, so it is recorded rather than inferred.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'submitted_by';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Receipt time. Turnaround requirements are measured from here and missing them is a regulatory finding.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'submitted_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Argument as submitted, retained verbatim for the case file.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'reason';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'open | in_review | upheld | overturned | partially_overturned | withdrawn.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Decision time. Null while open, which is how the overdue queue is found.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'decided_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Rationale sent to the appellant.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'decision_notes';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Additional amount payable as a result, in minor units. Null until decided; a successful appeal triggers a new adjudication round rather than editing the old one.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'overturned_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of overturned_amount_minor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'appeals',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

CREATE INDEX [IX_appeals_claim_level]
ON [appeals] ([claim_id], [appeal_level]);
GO

CREATE INDEX [IX_appeals_queue]
ON [appeals] ([status], [submitted_at]);
GO

CREATE TABLE [explanations_of_benefits] (
	[eob_id] BIGINT IDENTITY,
	[claim_id] BIGINT NOT NULL,
	[member_id] BIGINT NOT NULL,
	[eob_number] NVARCHAR(40) NOT NULL UNIQUE,
	[issued_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	[total_billed_minor] BIGINT NOT NULL DEFAULT 0,
	[total_allowed_minor] BIGINT NOT NULL DEFAULT 0,
	[total_plan_paid_minor] BIGINT NOT NULL DEFAULT 0,
	[total_patient_responsibility_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[delivery_channel] NVARCHAR(16) NOT NULL DEFAULT 'portal',
	[document_uri] NVARCHAR(500),
	[is_superseded] BIT NOT NULL DEFAULT 0,
	PRIMARY KEY([eob_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The member-facing statement, with its totals frozen at issue. It is a document, not a view: recomputing an old explanation from current data would produce a statement the member never actually received.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'eob_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Claim being explained.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'claim_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Member the statement was addressed to, which on a family policy is not always the patient.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'member_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Statement number quoted when a member calls about it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'eob_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the statement was produced. A reprocessed claim issues a second statement rather than replacing the first.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'issued_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Charges as submitted, in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'total_billed_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contracted allowed total.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'total_allowed_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the plan paid.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'total_plan_paid_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What the member owes. All four totals are snapshotted so a statement reprints byte-identically years later.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'total_patient_responsibility_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency for every total on the row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'portal | mail | email. Regulators care whether and how a statement was delivered.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'delivery_channel';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Location of the rendered PDF in document storage.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'document_uri';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set when a later statement replaces this one after reprocessing. The superseded row stays, because the member already received it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'explanations_of_benefits',
    @level2type=N'COLUMN',@level2name=N'is_superseded';
GO

CREATE INDEX [IX_eob_member_issued]
ON [explanations_of_benefits] ([member_id], [issued_at]);
GO

CREATE TABLE [provider_payments] (
	[payment_id] BIGINT IDENTITY,
	[provider_id] BIGINT NOT NULL,
	[payment_number] NVARCHAR(40) NOT NULL UNIQUE,
	[payment_method] NVARCHAR(16) NOT NULL DEFAULT 'eft',
	[trace_number] NVARCHAR(40),
	[total_amount_minor] BIGINT NOT NULL,
	[currency_code] CHAR(3) NOT NULL DEFAULT 'USD',
	[paid_at] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
	[status] NVARCHAR(20) NOT NULL DEFAULT 'issued',
	[remittance_uri] NVARCHAR(500),
	PRIMARY KEY([payment_id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A remittance covering many claims. Claims point at the payment rather than the reverse, which makes the relationship one payment to many claims without a join table and makes the reconciliation query a single grouped sum.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'payment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payee.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'provider_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cheque or EFT number, the reference a provider reconciles against.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'payment_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'eft | check | virtual_card.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'payment_method';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Banking trace or remittance trace number used to match the deposit to the advice.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'trace_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Total remitted in minor units, which must equal the sum of plan-paid amounts on the claims carrying this payment id.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'total_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of total_amount_minor.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Release date. Prompt-payment interest is calculated from claim receipt to here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'paid_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'issued | cleared | voided | returned. A returned EFT has to be reissued without re-adjudicating the claims.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Location of the electronic remittance advice file sent to the provider.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'provider_payments',
    @level2type=N'COLUMN',@level2name=N'remittance_uri';
GO

CREATE INDEX [IX_payments_provider_paid]
ON [provider_payments] ([provider_id], [paid_at]);
GO

CREATE INDEX [IX_payments_status_paid]
ON [provider_payments] ([status], [paid_at]);
GO


ALTER TABLE [benefit_rules]
ADD FOREIGN KEY([plan_id])
REFERENCES [plans]([plan_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [policies]
ADD FOREIGN KEY([plan_id])
REFERENCES [plans]([plan_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [policies]
ADD FOREIGN KEY([subscriber_member_id])
REFERENCES [members]([member_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [members]
ADD FOREIGN KEY([policy_id])
REFERENCES [policies]([policy_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [provider_network_status]
ADD FOREIGN KEY([provider_id])
REFERENCES [providers]([provider_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [provider_network_status]
ADD FOREIGN KEY([plan_id])
REFERENCES [plans]([plan_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([member_id])
REFERENCES [members]([member_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([policy_id])
REFERENCES [policies]([policy_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([billing_provider_id])
REFERENCES [providers]([provider_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([rendering_provider_id])
REFERENCES [providers]([provider_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([adjusted_from_claim_id])
REFERENCES [claims]([claim_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [claims]
ADD FOREIGN KEY([payment_id])
REFERENCES [provider_payments]([payment_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [claim_lines]
ADD FOREIGN KEY([claim_id])
REFERENCES [claims]([claim_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [adjudications]
ADD FOREIGN KEY([claim_line_id])
REFERENCES [claim_lines]([claim_line_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [adjudications]
ADD FOREIGN KEY([benefit_rule_id])
REFERENCES [benefit_rules]([benefit_rule_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [denials]
ADD FOREIGN KEY([adjudication_id])
REFERENCES [adjudications]([adjudication_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [appeals]
ADD FOREIGN KEY([claim_id])
REFERENCES [claims]([claim_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [appeals]
ADD FOREIGN KEY([denial_id])
REFERENCES [denials]([denial_id])
ON UPDATE NO ACTION ON DELETE SET NULL;
GO
ALTER TABLE [explanations_of_benefits]
ADD FOREIGN KEY([claim_id])
REFERENCES [claims]([claim_id])
ON UPDATE NO ACTION ON DELETE CASCADE;
GO
ALTER TABLE [explanations_of_benefits]
ADD FOREIGN KEY([member_id])
REFERENCES [members]([member_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
ALTER TABLE [provider_payments]
ADD FOREIGN KEY([provider_id])
REFERENCES [providers]([provider_id])
ON UPDATE NO ACTION ON DELETE NO ACTION;
GO
