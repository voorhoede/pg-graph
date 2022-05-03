export enum EventType {
    Citizen,
    Professional,
};

export enum GiftStatus {
    PENDING,
    REDEEMED,
};

export enum CountryCode {
    AF,
    AX,
    AL,
    DZ,
    AS,
    AD,
    AO,
    AI,
    AQ,
    AG,
    AR,
    AM,
    AW,
    AU,
    AT,
    AZ,
    BS,
    BH,
    BD,
    BB,
    BY,
    BE,
    BZ,
    BJ,
    BM,
    BT,
    BO,
    BQ,
    BA,
    BW,
    BV,
    BR,
    IO,
    BN,
    BG,
    BF,
    BI,
    CV,
    KH,
    CM,
    CA,
    KY,
    CF,
    TD,
    CL,
    CN,
    CX,
    CC,
    CO,
    KM,
    CG,
    CD,
    CK,
    CR,
    CI,
    HR,
    CU,
    CW,
    CY,
    CZ,
    DK,
    DJ,
    DM,
    DO,
    EC,
    EG,
    SV,
    GQ,
    ER,
    EE,
    SZ,
    ET,
    FK,
    FO,
    FJ,
    FI,
    FR,
    GF,
    PF,
    TF,
    GA,
    GM,
    GE,
    DE,
    GH,
    GI,
    GR,
    GL,
    GD,
    GP,
    GU,
    GT,
    GG,
    GN,
    GW,
    GY,
    HT,
    HM,
    VA,
    HN,
    HK,
    HU,
    IS,
    IN,
    ID,
    IR,
    IQ,
    IE,
    IM,
    IL,
    IT,
    JM,
    JP,
    JE,
    JO,
    KZ,
    KE,
    KI,
    KP,
    KR,
    KW,
    KG,
    LA,
    LV,
    LB,
    LS,
    LR,
    LY,
    LI,
    LT,
    LU,
    MO,
    MG,
    MW,
    MY,
    MV,
    ML,
    MT,
    MH,
    MQ,
    MR,
    MU,
    YT,
    MX,
    FM,
    MD,
    MC,
    MN,
    ME,
    MS,
    MA,
    MZ,
    MM,
    NA,
    NR,
    NP,
    NL,
    NC,
    NZ,
    NI,
    NE,
    NG,
    NU,
    NF,
    MK,
    MP,
    NO,
    OM,
    PK,
    PW,
    PS,
    PA,
    PG,
    PY,
    PE,
    PH,
    PN,
    PL,
    PT,
    PR,
    QA,
    RE,
    RO,
    RU,
    RW,
    BL,
    SH,
    KN,
    LC,
    MF,
    PM,
    VC,
    WS,
    SM,
    ST,
    SA,
    SN,
    RS,
    SC,
    SL,
    SG,
    SX,
    SK,
    SI,
    SB,
    SO,
    ZA,
    GS,
    SS,
    ES,
    LK,
    SD,
    SR,
    SJ,
    SE,
    CH,
    SY,
    TW,
    TJ,
    TZ,
    TH,
    TL,
    TG,
    TK,
    TO,
    TT,
    TN,
    TR,
    TM,
    TC,
    TV,
    UG,
    UA,
    AE,
    GB,
    US,
    UM,
    UY,
    UZ,
    VU,
    VE,
    VN,
    VG,
    VI,
    WF,
    EH,
    YE,
    ZM,
    ZW,
};

export enum PaymentStatus {
    PENDING,
    PAID,
};

export enum UserGroupRole {
    ADMIN,
    MEMBER,
};

export enum GroupEventRole {
    SPONSOR,
    PARTNER,
};

export enum PlotCurrentUse {
    ForestLand,
    Cropland,
    Grassland,
    Wetland,
    Settlements,
    Other,
};

export enum PlotObjectiveUse {
    EcologicalRestoration,
    TimberPlantation,
    FoodForestOrAgroforestry,
    GreenInfrastructure,
    Garden,
    Other,
};

export enum TreeRelationType {
    OWNED,
    GIFTED,
    PLANTED,
    SPONSORED,
};

export enum SubscriptionInterval {
    MONTHLY,
    YEARLY,
};

export type AuthConnection = {
    __tableName: 'AuthConnection',
    type: string,
    auth_id: string,
    user_id: number,
    __links: 
        { type: 'one', destTable: 'User', destColumn: 'id', srcColumn: 'user_id' },
};

export type CachedClusters = {
    __tableName: 'CachedClusters',
    id: number,
    center: unknown,
    count: number,
    level: number,
    tree_id?: number,
};

export type Config = {
    __tableName: 'Config',
    id: number,
    cost_per_tree: number,
    currency: string,
    max_transaction_amount: number,
};

export type CountryLocalization = {
    __tableName: 'CountryLocalization',
    code: CountryCode,
    language: string,
    name: string,
};

export type Event = {
    __tableName: 'Event',
    id: number,
    date_from?: Date,
    date_to?: Date,
    event_type?: EventType,
    expected_number_of_trees?: number,
    gathering_point?: unknown,
    name?: string,
    number_of_participants?: number,
    dato_id?: string,
    plot_id?: number,
    __links: 
        { type: 'one', destTable: 'Plot', destColumn: 'id', srcColumn: 'plot_id' } |
        { type: 'many', destTable: 'EventGroup', destColumn: 'event_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'EventSpeciesToPlant', destColumn: 'event_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Tree', destColumn: 'event_id', srcColumn: 'id' },
};

export type EventGroup = {
    __tableName: 'EventGroup',
    id: number,
    group_event_role: GroupEventRole,
    event_id: number,
    group_id: number,
    __links: 
        { type: 'one', destTable: 'Event', destColumn: 'id', srcColumn: 'event_id' } |
        { type: 'one', destTable: 'Group', destColumn: 'id', srcColumn: 'group_id' },
};

export type EventSpeciesToPlant = {
    __tableName: 'EventSpeciesToPlant',
    event_id: number,
    specie_id: number,
    __links: 
        { type: 'one', destTable: 'Event', destColumn: 'id', srcColumn: 'event_id' } |
        { type: 'one', destTable: 'Specie', destColumn: 'id', srcColumn: 'specie_id' },
};

export type Gift = {
    __tableName: 'Gift',
    id: number,
    email?: string,
    message?: string,
    status: GiftStatus,
    vouchercode?: string,
    purpose_id?: string,
    __links: 
        { type: 'many', destTable: 'Order', destColumn: 'gift_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Subscription', destColumn: 'gift_id', srcColumn: 'id' },
};

export type Group = {
    __tableName: 'Group',
    id: number,
    associated_with_life_terra: boolean,
    name: string,
    dato_id?: string,
    parent_group_id?: number,
    __links: 
        { type: 'one', destTable: 'Group', destColumn: 'id', srcColumn: 'parent_group_id' } |
        { type: 'many', destTable: 'EventGroup', destColumn: 'group_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Group', destColumn: 'parent_group_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'TreeRelation', destColumn: 'group_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'UserGroup', destColumn: 'group_id', srcColumn: 'id' },
};

export type Order = {
    __tableName: 'Order',
    id: number,
    affiliate?: string,
    amount_currency: string,
    amount_per_tree: number,
    date_ordered: Date,
    payment_result_code?: string,
    payment_status: PaymentStatus,
    psp_reference?: string,
    shopper_locale: string,
    gift_id?: number,
    subscription_id?: number,
    user_id: number,
    __links: 
        { type: 'one', destTable: 'Gift', destColumn: 'id', srcColumn: 'gift_id' } |
        { type: 'one', destTable: 'Subscription', destColumn: 'id', srcColumn: 'subscription_id' } |
        { type: 'one', destTable: 'User', destColumn: 'id', srcColumn: 'user_id' } |
        { type: 'many', destTable: 'Tree', destColumn: 'order_id', srcColumn: 'id' },
};

export type Plot = {
    __tableName: 'Plot',
    id: number,
    area: unknown,
    country_code: CountryCode,
    current_use?: PlotCurrentUse,
    name: string,
    objective_use?: PlotObjectiveUse,
    dato_id: string,
    __links: 
        { type: 'many', destTable: 'Event', destColumn: 'plot_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'PlotSpeciesToPlant', destColumn: 'plot_id', srcColumn: 'id' },
};

export type PlotSpeciesToPlant = {
    __tableName: 'PlotSpeciesToPlant',
    amount: number,
    dato_id: string,
    plot_id: number,
    specie_id: number,
    __links: 
        { type: 'one', destTable: 'Plot', destColumn: 'id', srcColumn: 'plot_id' } |
        { type: 'one', destTable: 'Specie', destColumn: 'id', srcColumn: 'specie_id' },
};

export type Specie = {
    __tableName: 'Specie',
    id: number,
    family?: string,
    genus?: string,
    dato_id: string,
    __links: 
        { type: 'many', destTable: 'EventSpeciesToPlant', destColumn: 'specie_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'PlotSpeciesToPlant', destColumn: 'specie_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'SpecieLocalization', destColumn: 'specie_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Tree', destColumn: 'species_id', srcColumn: 'id' },
};

export type SpecieLocalization = {
    __tableName: 'SpecieLocalization',
    common_names: string,
    language: string,
    specie_id: number,
    __links: 
        { type: 'one', destTable: 'Specie', destColumn: 'id', srcColumn: 'specie_id' },
};

export type Subscription = {
    __tableName: 'Subscription',
    id: number,
    adyen_token?: string,
    amount_of_trees: number,
    amount_per_tree: number,
    date_started: Date,
    has_failed_order: boolean,
    interval: SubscriptionInterval,
    preferred_country?: string,
    shopper_locale: string,
    gift_id?: number,
    subscriber_id: number,
    __links: 
        { type: 'one', destTable: 'Gift', destColumn: 'id', srcColumn: 'gift_id' } |
        { type: 'one', destTable: 'User', destColumn: 'id', srcColumn: 'subscriber_id' } |
        { type: 'many', destTable: 'Order', destColumn: 'subscription_id', srcColumn: 'id' },
};

export type Tree = {
    __tableName: 'Tree',
    id: number,
    coordinates?: unknown,
    coordinates_accuracy: number,
    created_at: Date,
    name: string,
    planted_at?: Date,
    event_id: number,
    order_id?: number,
    picture_id?: string,
    species_id: number,
    uuid: unknown,
    __links: 
        { type: 'one', destTable: 'Event', destColumn: 'id', srcColumn: 'event_id' } |
        { type: 'one', destTable: 'Order', destColumn: 'id', srcColumn: 'order_id' } |
        { type: 'one', destTable: 'Specie', destColumn: 'id', srcColumn: 'species_id' } |
        { type: 'many', destTable: 'TreeRelation', destColumn: 'tree_id', srcColumn: 'id' },
};

export type TreeRelation = {
    __tableName: 'TreeRelation',
    id: number,
    tree_relation: TreeRelationType,
    group_id?: number,
    tree_id: number,
    user_id?: number,
    __links: 
        { type: 'one', destTable: 'Group', destColumn: 'id', srcColumn: 'group_id' } |
        { type: 'one', destTable: 'Tree', destColumn: 'id', srcColumn: 'tree_id' } |
        { type: 'one', destTable: 'User', destColumn: 'id', srcColumn: 'user_id' },
};

export type User = {
    __tableName: 'User',
    id: number,
    agree_with_terms: boolean,
    created_at: Date,
    email: string,
    given_name?: string,
    newsletter_opt_in: boolean,
    surname?: string,
    __links: 
        { type: 'many', destTable: 'AuthConnection', destColumn: 'user_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Order', destColumn: 'user_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'Subscription', destColumn: 'subscriber_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'TreeRelation', destColumn: 'user_id', srcColumn: 'id' } |
        { type: 'many', destTable: 'UserGroup', destColumn: 'user_id', srcColumn: 'id' },
};

export type UserGroup = {
    __tableName: 'UserGroup',
    id: number,
    role: UserGroupRole,
    group_id: number,
    user_id: number,
    __links: 
        { type: 'one', destTable: 'Group', destColumn: 'id', srcColumn: 'group_id' } |
        { type: 'one', destTable: 'User', destColumn: 'id', srcColumn: 'user_id' },
};

export type _prismaMigrations = {
    __tableName: '_prisma_migrations',
    id: string,
    applied_steps_count: number,
    checksum: string,
    finished_at?: Date,
    logs?: string,
    migration_name: string,
    rolled_back_at?: Date,
    started_at: Date,
};

export type SpatialRefSys = {
    __tableName: 'spatial_ref_sys',
    auth_name?: string,
    proj4text?: string,
    srtext?: string,
    auth_srid?: number,
    srid: number,
};

export type Tables = 
    AuthConnection |
    CachedClusters |
    Config |
    CountryLocalization |
    Event |
    EventGroup |
    EventSpeciesToPlant |
    Gift |
    Group |
    Order |
    Plot |
    PlotSpeciesToPlant |
    Specie |
    SpecieLocalization |
    Subscription |
    Tree |
    TreeRelation |
    User |
    UserGroup |
    _prismaMigrations |
    SpatialRefSys