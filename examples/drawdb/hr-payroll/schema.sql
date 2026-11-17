CREATE TABLE [employees] (
	[id] BIGINT IDENTITY,
	[employee_number] NVARCHAR(24) NOT NULL UNIQUE,
	[legal_first_name] NVARCHAR(100) NOT NULL,
	[legal_last_name] NVARCHAR(100) NOT NULL,
	[preferred_name] NVARCHAR(100),
	[work_email] NVARCHAR(320) NOT NULL UNIQUE,
	[personal_email] NVARCHAR(320),
	[national_id_last_four] NCHAR(4),
	[date_of_birth] DATE,
	[hire_date] DATE NOT NULL,
	[termination_date] DATE,
	[employment_status] NVARCHAR(24) NOT NULL DEFAULT 'active',
	[employment_type] NVARCHAR(24) NOT NULL DEFAULT 'full_time',
	[pay_frequency] NVARCHAR(16) NOT NULL DEFAULT 'monthly',
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The person. Deliberately thin: everything that changes over a career — job, manager, pay, department — lives in dated rows elsewhere, so this table holds only facts that identify a human being.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key, an IDENTITY column.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Externally quotable staff number printed on payslips. Never reused, because a rehired leaver must be distinguishable from the person who held the number before.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'employee_number';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First name exactly as it appears on identity documents. Payroll filings are rejected on a mismatch, which is why the preferred name lives in a separate column.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'legal_first_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Family name as it appears on identity documents.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'legal_last_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What colleagues call this person. Directories read this; tax filings never do.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'preferred_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Company address, the login identity for self-service.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'work_email';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Private address. Required to send the final payslip and tax documents after the company account is closed.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'personal_email';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last four characters of the national identifier, enough to confirm identity on a support call. The full number belongs in the payroll vendor vault, not here.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'national_id_last_four';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Drives benefits eligibility bands and statutory retirement handling.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'date_of_birth';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of the current period of employment. Seniority is derived from this plus any prior periods, not from row creation time.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'hire_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day worked. Null while employed. Set rather than deleted, because payroll must still produce final payments and year-end filings afterwards.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'termination_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'active | on_leave | suspended | terminated. Anything other than active changes whether the payroll engine expects a payslip this period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'employment_status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'full_time | part_time | contractor | intern. Decides which statutory deductions and which time off policies apply.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'employment_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'weekly | biweekly | semimonthly | monthly. Held on the employee because a single company commonly runs more than one calendar.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'pay_frequency';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Row creation in UTC. Distinct from hire_date, which is a local calendar date agreed in a contract.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employees',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [idx_employees_status_termination]
ON [employees] ([employment_status], [termination_date]);
GO

CREATE TABLE [departments] (
	[id] BIGINT IDENTITY,
	[code] NVARCHAR(16) NOT NULL UNIQUE,
	[name] NVARCHAR(160) NOT NULL,
	[parent_department_id] BIGINT,
	[head_employee_id] BIGINT,
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The cost-centre tree. Reporting lines are per assignment rather than per department, because a person can report to someone outside their own department.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Short cost-centre code used by finance. Payroll expense posts against this, so it outlives any renaming of the department.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Display name, which changes far more often than the code does.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Parent in the org tree. Null for the top level. Self-referencing rather than a fixed set of division columns, because org depth changes every reorganisation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'parent_department_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Current department head. Null during a vacancy, which is a real and common state.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'head_employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Retired departments stay as rows because historical payroll expense still points at them.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'departments',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE TABLE [positions] (
	[id] BIGINT IDENTITY,
	[position_code] NVARCHAR(24) NOT NULL UNIQUE,
	[title] NVARCHAR(160) NOT NULL,
	[job_family] NVARCHAR(80) NOT NULL,
	[job_level] SMALLINT NOT NULL,
	[is_exempt] BIT NOT NULL DEFAULT 0,
	[min_annual_minor] BIGINT,
	[max_annual_minor] BIGINT,
	[currency_code] CHAR(3),
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The job catalogue: what a role is, independent of who is doing it. Separating it from assignments is what lets two people hold the same role and lets a role stay open with nobody in it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Job code used in salary benchmarking and in headcount plans.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'position_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Canonical job title. The title a person shows on a business card is stored on the assignment, since it drifts from the catalogue.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'title';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Engineering, sales, finance and so on. The grouping compensation bands are set against.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'job_family';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Numeric level within the family. An integer so that band comparisons and promotion checks are arithmetic, not string matching.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'job_level';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the role is exempt from overtime rules. Sits on the position rather than the person so that a reclassification applies consistently.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'is_exempt';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Bottom of the salary band in minor units. Null for roles with no published band.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'min_annual_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Top of the salary band in minor units. Compensation changes outside the band are allowed but flagged in review.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'max_annual_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency the band is expressed in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the role can currently be filled.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'positions',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE TABLE [employee_assignments] (
	[id] BIGINT IDENTITY,
	[employee_id] BIGINT NOT NULL,
	[position_id] BIGINT NOT NULL,
	[department_id] BIGINT NOT NULL,
	[manager_employee_id] BIGINT,
	[working_title] NVARCHAR(160),
	[fte_ratio] DECIMAL(5,4) NOT NULL DEFAULT 1,
	[location_code] NVARCHAR(24),
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	[change_reason] NVARCHAR(40) NOT NULL DEFAULT 'hire',
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The org chart over time. Every reorganisation, promotion and transfer is a new row, so the question "who did this person report to in March" is a lookup rather than an archaeology project.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Person holding the assignment.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Role held during this period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'position_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cost centre the payroll expense posts against for this period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'department_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who this person reported to during the period. Null for the chief executive and briefly during a reorganisation.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'manager_employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Title as used externally, when it differs from the catalogue title.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'working_title';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Full-time equivalent fraction. 0.6 for a three-day week. Pro-rates both salary and time off accrual.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'fte_ratio';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Work location, which drives tax jurisdiction and public holiday calendar.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'location_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day this assignment was in force.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day in force. Null means current. A promotion closes the old row and opens a new one rather than editing in place.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'hire | promotion | transfer | reorg | demotion | fte_change | termination. The reason is the column the people analytics team actually queries.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'change_reason';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the record was entered, which can be well after effective_from for a backdated change.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'employee_assignments',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [idx_assignments_employee_effective]
ON [employee_assignments] ([employee_id], [effective_from]);
GO

CREATE INDEX [idx_assignments_manager_current]
ON [employee_assignments] ([manager_employee_id], [effective_to]);
GO

CREATE TABLE [compensation_records] (
	[id] BIGINT IDENTITY,
	[employee_id] BIGINT NOT NULL,
	[assignment_id] BIGINT,
	[pay_type] NVARCHAR(24) NOT NULL DEFAULT 'salary',
	[annual_amount_minor] BIGINT,
	[hourly_rate_minor] BIGINT,
	[currency_code] CHAR(3) NOT NULL,
	[bonus_target_bps] INTEGER NOT NULL DEFAULT 0,
	[change_reason] NVARCHAR(40) NOT NULL DEFAULT 'hire',
	[effective_from] DATE NOT NULL,
	[effective_to] DATE,
	[approved_by_employee_id] BIGINT,
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Pay as a sequence of dated rows, never an updated column. A salary is a contractual fact with a date attached: overwriting it destroys the evidence for every payslip already issued and makes a retroactive correction impossible to compute.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Person being paid.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Assignment this pay applies to. Null for a pure merit increase that did not change the job.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'assignment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'salary | hourly | commission_draw. Decides whether annual_amount_minor or hourly_rate_minor carries the number.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'pay_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Full-time annual salary in minor units, before the FTE ratio is applied. Null for hourly staff.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'annual_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Hourly rate in minor units. Null for salaried staff.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'hourly_rate_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217. Stored per record because a transfer abroad changes the currency, and old rows must keep the one they were agreed in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Bonus target as basis points of base pay. Basis points as an integer keeps the arithmetic exact and matches what the offer letter says.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'bonus_target_bps';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'hire | merit | promotion | market_adjustment | correction | demotion. A correction is a new row too, so the mistaken figure stays visible.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'change_reason';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day this pay applies. Payroll picks the row in force on the period end date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'effective_from';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day this pay applies. Null means current.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'effective_to';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who signed off. Null only for records loaded during migration from a prior system.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'approved_by_employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Entry time. Together with effective_from it exposes backdating, which auditors ask about first.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'compensation_records',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE UNIQUE INDEX [uq_comp_employee_effective]
ON [compensation_records] ([employee_id], [effective_from]);
GO

CREATE TABLE [payroll_runs] (
	[id] BIGINT IDENTITY,
	[run_reference] NVARCHAR(32) NOT NULL UNIQUE,
	[pay_frequency] NVARCHAR(16) NOT NULL,
	[period_start] DATE NOT NULL,
	[period_end] DATE NOT NULL,
	[payment_date] DATE NOT NULL,
	[status] NVARCHAR(24) NOT NULL DEFAULT 'draft',
	[employee_count] INTEGER NOT NULL DEFAULT 0,
	[gross_total_minor] BIGINT NOT NULL DEFAULT 0,
	[net_total_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL,
	[approved_by_employee_id] BIGINT,
	[approved_at] DATETIME2(3),
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One pay cycle. The run is the unit of approval and of reversal: a mistake is fixed by an adjustment in a later run, never by editing an approved one, because the money and the tax filing have already left the building.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Human-quotable run identifier used in finance journals and in support conversations.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'run_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'weekly | biweekly | semimonthly | monthly. A run covers one calendar, so a company with two calendars has two runs per month.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'pay_frequency';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of work covered.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'period_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of work covered. Compensation is resolved as of this date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'period_end';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date money reaches employees. Distinct from period_end, and it is the date that decides the tax year a payment falls in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'payment_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'draft | calculated | approved | paid | cancelled. A run only becomes immutable at approved; before that it can be recalculated freely.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payslips produced. Stored so a run can be compared against the previous one without recounting.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'employee_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of gross pay across payslips, in minor units. A control total: if it does not match the sum of the payslips, the run does not get approved.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'gross_total_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of net pay, in minor units. The figure the bank file must tie to exactly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'net_total_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217. A run pays in one currency; multi-currency payroll means multiple runs.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Who approved. Null until approval, and the presence of this value is what locks the run.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'approved_by_employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Approval time in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'approved_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the run was opened.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payroll_runs',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [idx_runs_frequency_period]
ON [payroll_runs] ([pay_frequency], [period_end]);
GO

CREATE INDEX [idx_runs_status]
ON [payroll_runs] ([status]);
GO

CREATE TABLE [payslips] (
	[id] BIGINT IDENTITY,
	[payroll_run_id] BIGINT NOT NULL,
	[employee_id] BIGINT NOT NULL,
	[compensation_record_id] BIGINT,
	[department_id] BIGINT,
	[gross_pay_minor] BIGINT NOT NULL DEFAULT 0,
	[total_deductions_minor] BIGINT NOT NULL DEFAULT 0,
	[total_tax_minor] BIGINT NOT NULL DEFAULT 0,
	[net_pay_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL,
	[payment_method] NVARCHAR(24) NOT NULL DEFAULT 'bank_transfer',
	[payment_reference] NVARCHAR(64),
	[document_key] NVARCHAR(255),
	[is_adjustment] BIT NOT NULL DEFAULT 0,
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One employee in one run. Totals are stored rather than computed on read because a payslip is a document the employee already downloaded: it must render identically in five years regardless of how the calculation code has changed since.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Run that produced this payslip.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'payroll_run_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Person paid.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The pay record used for the calculation. Recording which row was used makes every payslip reproducible even after later compensation history is added.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'compensation_record_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Cost centre at the time of the run, snapshotted so that a later reorganisation does not rewrite historical payroll expense.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'department_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of earning lines in minor units.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'gross_pay_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of deduction lines, always stored positive.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'total_deductions_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Sum of withholding rows, kept apart from other deductions because tax is reported separately.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'total_tax_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'What is actually transferred. Gross less deductions less tax, and the only number most employees ever check.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'net_pay_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of this payslip.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'bank_transfer | cheque | cash. Determines which output file the payment lands in.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'payment_method';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Bank reference once paid, unique per payment file line. Null until the file is sent.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'payment_reference';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Object storage key for the rendered PDF, generated once so a reissued copy is byte-identical to the original.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'document_key';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set when this payslip corrects an earlier period rather than paying the current one. Retroactive pay is a normal, expected event.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'is_adjustment';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Calculation time.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslips',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE UNIQUE INDEX [uq_payslips_run_employee]
ON [payslips] ([payroll_run_id], [employee_id]);
GO

CREATE INDEX [idx_payslips_employee_created]
ON [payslips] ([employee_id], [created_at]);
GO

CREATE TABLE [payslip_lines] (
	[id] BIGINT IDENTITY,
	[payslip_id] BIGINT NOT NULL,
	[line_kind] NVARCHAR(16) NOT NULL,
	[code] NVARCHAR(32) NOT NULL,
	[description] NVARCHAR(160) NOT NULL,
	[quantity] DECIMAL(12,4),
	[rate_minor] BIGINT,
	[amount_minor] BIGINT NOT NULL,
	[currency_code] CHAR(3) NOT NULL,
	[benefit_enrolment_id] BIGINT,
	[relates_to_period_end] DATE,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The itemised payslip. Every element is a row, so adding an allowance or a new deduction is a data change; the alternative, a column per pay element, is a migration every time HR invents a benefit.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Parent payslip.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'payslip_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'earning | deduction. One table rather than two, because both print in the same list and both need the same rate and quantity shape.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'line_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Pay element code such as base, overtime, bonus, pension, garnishment. Stable across renames so that year-on-year reports line up.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Text shown on the payslip, snapshotted at calculation time so a later relabelling does not alter an issued document.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'description';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Hours, days or units. Null for a flat amount, which is why the amount is stored rather than derived from rate times quantity.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'quantity';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Rate per unit in minor units. Null for a flat amount.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'rate_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Line amount in minor units, always positive. line_kind carries the sign, so reports never depend on interpreting a negative number correctly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217, matching the payslip currency.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Set when this deduction comes from a benefits election, linking the payslip line back to the reason it exists.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'benefit_enrolment_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Period this line really belongs to, when it differs from the run period. This is what makes retroactive pay attributable to the month it was earned.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'payslip_lines',
    @level2type=N'COLUMN',@level2name=N'relates_to_period_end';
GO

CREATE INDEX [idx_payslip_lines_slip_kind]
ON [payslip_lines] ([payslip_id], [line_kind]);
GO

CREATE TABLE [tax_withholdings] (
	[id] BIGINT IDENTITY,
	[payslip_id] BIGINT NOT NULL,
	[jurisdiction_code] NVARCHAR(24) NOT NULL,
	[tax_type] NVARCHAR(32) NOT NULL,
	[taxable_base_minor] BIGINT NOT NULL,
	[employee_amount_minor] BIGINT NOT NULL DEFAULT 0,
	[employer_amount_minor] BIGINT NOT NULL DEFAULT 0,
	[rate_bps] INTEGER,
	[currency_code] CHAR(3) NOT NULL,
	[filing_period] NCHAR(7) NOT NULL,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One row per tax per payslip. Taxes are not just another deduction line: they carry their own base, an employer share that never appears in net pay, and a filing period that decides which return they land on.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payslip the withholding was taken from.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'payslip_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Tax authority code, such as a country, state or municipality. A single payslip commonly withholds for several at once.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'jurisdiction_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'income | social_security | medicare | unemployment | local. Separated because each files on its own schedule and to its own authority.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'tax_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Base the tax was computed on, in minor units. Rarely equal to gross pay, since pre-tax deductions reduce it, and storing it is what makes a filing defensible.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'taxable_base_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Withheld from the employee, in minor units. Reduces net pay.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'employee_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Paid by the employer on top, in minor units. Never touches net pay but is owed to the same authority.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'employer_amount_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Effective rate in basis points. Stored for explanation only; the amount is the authoritative figure.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'rate_bps';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the withholding.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Filing period as YYYY-MM. Grouping key for the remittance return, which is driven by payment date rather than work period.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'tax_withholdings',
    @level2type=N'COLUMN',@level2name=N'filing_period';
GO

CREATE INDEX [idx_withholdings_jurisdiction_period]
ON [tax_withholdings] ([jurisdiction_code], [filing_period]);
GO

CREATE INDEX [idx_withholdings_payslip_type]
ON [tax_withholdings] ([payslip_id], [tax_type]);
GO

CREATE TABLE [time_off_policies] (
	[id] BIGINT IDENTITY,
	[policy_code] NVARCHAR(24) NOT NULL UNIQUE,
	[name] NVARCHAR(120) NOT NULL,
	[leave_type] NVARCHAR(24) NOT NULL,
	[accrual_method] NVARCHAR(24) NOT NULL DEFAULT 'monthly',
	[accrual_hours_per_period] DECIMAL(8,4) NOT NULL DEFAULT 0,
	[max_balance_hours] DECIMAL(8,2),
	[carryover_limit_hours] DECIMAL(8,2),
	[is_paid] BIT NOT NULL DEFAULT 1,
	[requires_approval] BIT NOT NULL DEFAULT 1,
	[is_active] BIT NOT NULL DEFAULT 1,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'The rules for one kind of leave. Kept as data rather than code because accrual rates, caps and carryover limits differ by country and change on a legislative timetable nobody controls.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Short code used on requests and balance reports.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'policy_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Policy name as employees see it, for example Annual Leave or Sick Leave.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'vacation | sick | parental | unpaid | bereavement. Decides whether absence is paid and whether it affects payroll at all.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'leave_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'monthly | per_pay_period | annual_grant | unlimited. Unlimited policies still generate taken rows, so usage remains measurable.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'accrual_method';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Hours granted each accrual period, pro-rated by the FTE ratio of the assignment in force.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'accrual_hours_per_period';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Accrual ceiling. Null means no cap. A cap is a statutory requirement in several jurisdictions.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'max_balance_hours';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Hours that survive the year boundary. Anything above is written off by a dated forfeiture row rather than by resetting a balance.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'carryover_limit_hours';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether absence under this policy is paid. Unpaid leave still produces payroll effects, just negative ones.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'is_paid';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether a manager must approve before the absence is recorded.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'requires_approval';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Retired policies stay as rows because historical balances refer to them.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_policies',
    @level2type=N'COLUMN',@level2name=N'is_active';
GO

CREATE TABLE [time_off_transactions] (
	[id] BIGINT IDENTITY,
	[employee_id] BIGINT NOT NULL,
	[policy_id] BIGINT NOT NULL,
	[transaction_kind] NVARCHAR(24) NOT NULL,
	[hours] DECIMAL(8,4) NOT NULL,
	[effective_date] DATE NOT NULL,
	[absence_start_date] DATE,
	[absence_end_date] DATE,
	[status] NVARCHAR(24) NOT NULL DEFAULT 'posted',
	[approved_by_employee_id] BIGINT,
	[payslip_id] BIGINT,
	[note] NVARCHAR(400),
	[created_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A ledger of leave, not a balance column. Every accrual, absence, carryover forfeiture and payout is an append-only row, so a disputed balance can be reconstructed line by line instead of argued about.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whose balance moves.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Policy the movement belongs to. Balances are per policy, never a single pooled number.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'policy_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'accrual | taken | adjustment | forfeiture | payout. The balance is the signed sum of these rows, which is why nothing here is ever updated.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'transaction_kind';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Signed hours. Positive for accrual, negative for taken, forfeiture and payout. Hours rather than days because a half day means different things at different FTE ratios.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'hours';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Date the movement counts for. Accrual on the period end, absence on the day taken.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'effective_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of absence, for taken rows. Null for accruals.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'absence_start_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of absence, for taken rows.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'absence_end_date';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'requested | approved | posted | cancelled | rejected. Only posted rows count toward the balance, so a pending request cannot overdraw it.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Approving manager. Null for system-generated accruals.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'approved_by_employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Payslip that paid this out, for payout rows and unpaid deductions. Null otherwise.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'payslip_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Free-text reason, mostly used on adjustments where the arithmetic alone does not explain the row.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'note';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Entry time in UTC.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'time_off_transactions',
    @level2type=N'COLUMN',@level2name=N'created_at';
GO

CREATE INDEX [idx_timeoff_employee_policy_date]
ON [time_off_transactions] ([employee_id], [policy_id], [effective_date]);
GO

CREATE INDEX [idx_timeoff_status_date]
ON [time_off_transactions] ([status], [effective_date]);
GO

CREATE TABLE [benefit_plans] (
	[id] BIGINT IDENTITY,
	[plan_code] NVARCHAR(24) NOT NULL UNIQUE,
	[name] NVARCHAR(160) NOT NULL,
	[benefit_type] NVARCHAR(32) NOT NULL,
	[provider_name] NVARCHAR(160),
	[employee_cost_minor] BIGINT NOT NULL DEFAULT 0,
	[employer_cost_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL,
	[is_pretax] BIT NOT NULL DEFAULT 0,
	[plan_year_start] DATE NOT NULL,
	[plan_year_end] DATE NOT NULL,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'A benefit as offered in one plan year. Rates are versioned by plan year rather than updated in place, because a deduction taken last March must still be explainable at the rate that applied then.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Short code used on payslip deduction lines and in carrier files.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'plan_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plan name as employees see it during enrolment.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'health | dental | vision | life | pension | commuter. Decides tax treatment more than anything else does.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'benefit_type';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Carrier or administrator. Text rather than a foreign key, because the carrier is outside this system.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'provider_name';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Employee contribution per pay period in minor units, the amount that becomes a deduction line.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'employee_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Employer contribution per pay period. Never a deduction, but it is reported in total compensation statements.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'employer_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the contributions.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Whether the employee contribution reduces the taxable base. This single bit is the difference between two correct-looking but different tax outcomes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'is_pretax';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Start of the plan year. Rates are fixed for a plan year, so a new year is a new plan row rather than an edit.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'plan_year_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'End of the plan year.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_plans',
    @level2type=N'COLUMN',@level2name=N'plan_year_end';
GO

CREATE TABLE [benefit_enrolments] (
	[id] BIGINT IDENTITY,
	[employee_id] BIGINT NOT NULL,
	[plan_id] BIGINT NOT NULL,
	[coverage_tier] NVARCHAR(24) NOT NULL DEFAULT 'employee',
	[dependent_count] SMALLINT NOT NULL DEFAULT 0,
	[employee_cost_minor] BIGINT NOT NULL DEFAULT 0,
	[currency_code] CHAR(3) NOT NULL,
	[status] NVARCHAR(24) NOT NULL DEFAULT 'active',
	[elected_at] DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
	[coverage_start] DATE NOT NULL,
	[coverage_end] DATE,
	PRIMARY KEY([id])
);
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'One election by one employee in one plan year. Ending cover closes the row with a date instead of deleting it, because a terminated election is exactly what explains a deduction that stopped mid-year.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Surrogate primary key.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Enrolled employee.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'employee_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Plan elected.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'plan_id';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'employee | employee_spouse | employee_children | family. The tier, not the plan alone, sets the contribution amount.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'coverage_tier';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Dependents covered. Stored because carrier files bill on headcount, while dependent identities are held by the carrier.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'dependent_count';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Contribution for this election in minor units, snapshotted from the plan and tier at enrolment so a mid-year plan change cannot silently re-rate an existing election.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'employee_cost_minor';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'ISO 4217 currency of the contribution.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'currency_code';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'pending | active | waived | terminated. A waiver is recorded rather than left as an absent row, because proving an employee declined coverage is a compliance requirement.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'status';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'When the election was made, which matters during open enrolment disputes.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'elected_at';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'First day of cover. Often the first of the month after the qualifying event rather than the election date.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'coverage_start';
GO

EXEC sys.sp_addextendedproperty
    @name=N'MS_Description', @value=N'Last day of cover. Null while active. Set on termination so that the final deduction can be pro-rated correctly.',
    @level0type=N'SCHEMA',@level0name=N'dbo',
    @level1type=N'TABLE',@level1name=N'benefit_enrolments',
    @level2type=N'COLUMN',@level2name=N'coverage_end';
GO

CREATE UNIQUE INDEX [uq_enrolment_employee_plan_start]
ON [benefit_enrolments] ([employee_id], [plan_id], [coverage_start]);
GO


ALTER TABLE [departments]
ADD FOREIGN KEY([parent_department_id])
REFERENCES [departments]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [departments]
ADD FOREIGN KEY([head_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [employee_assignments]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [employee_assignments]
ADD FOREIGN KEY([position_id])
REFERENCES [positions]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [employee_assignments]
ADD FOREIGN KEY([department_id])
REFERENCES [departments]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [employee_assignments]
ADD FOREIGN KEY([manager_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [compensation_records]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [compensation_records]
ADD FOREIGN KEY([assignment_id])
REFERENCES [employee_assignments]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [compensation_records]
ADD FOREIGN KEY([approved_by_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [payroll_runs]
ADD FOREIGN KEY([approved_by_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [payslips]
ADD FOREIGN KEY([payroll_run_id])
REFERENCES [payroll_runs]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [payslips]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [payslips]
ADD FOREIGN KEY([compensation_record_id])
REFERENCES [compensation_records]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [payslips]
ADD FOREIGN KEY([department_id])
REFERENCES [departments]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [payslip_lines]
ADD FOREIGN KEY([payslip_id])
REFERENCES [payslips]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [payslip_lines]
ADD FOREIGN KEY([benefit_enrolment_id])
REFERENCES [benefit_enrolments]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [tax_withholdings]
ADD FOREIGN KEY([payslip_id])
REFERENCES [payslips]([id])
ON UPDATE CASCADE ON DELETE CASCADE;
GO
ALTER TABLE [time_off_transactions]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [time_off_transactions]
ADD FOREIGN KEY([policy_id])
REFERENCES [time_off_policies]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [time_off_transactions]
ADD FOREIGN KEY([approved_by_employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [time_off_transactions]
ADD FOREIGN KEY([payslip_id])
REFERENCES [payslips]([id])
ON UPDATE CASCADE ON DELETE SET NULL;
GO
ALTER TABLE [benefit_enrolments]
ADD FOREIGN KEY([employee_id])
REFERENCES [employees]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
ALTER TABLE [benefit_enrolments]
ADD FOREIGN KEY([plan_id])
REFERENCES [benefit_plans]([id])
ON UPDATE CASCADE ON DELETE RESTRICT;
GO
