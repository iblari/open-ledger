/**
 * Yearly-only measures (published once a year, never monthly).
 *
 *  Poverty      Census, official poverty rate, all people (CPS ASEC,
 *               Historical Poverty Table 2). Where Census published two
 *               estimates for a year (method changes in 2013, 2017, 2020),
 *               the newer method is used.
 *  Inequality   World Inequality Database, pre-tax national income share of
 *               the top 10%.
 *  Median household income comes from FRED (MEHOINUSA672N) at run time.
 *
 * Update each September when Census publishes the previous year.
 */
export const POVERTY: Record<number, number> = { 1969: 12.1, 1970: 12.6, 1971: 12.5, 1972: 11.9, 1973: 11.1, 1974: 11.2, 1975: 12.3, 1976: 11.8, 1977: 11.6, 1978: 11.4, 1979: 11.7, 1980: 13.0, 1981: 14.0, 1982: 15.0, 1983: 15.2, 1984: 14.4, 1985: 14.0, 1986: 13.6, 1987: 13.4, 1988: 13.0, 1989: 12.8, 1990: 13.5, 1991: 14.2, 1992: 14.8, 1993: 15.1, 1994: 14.5, 1995: 13.8, 1996: 13.7, 1997: 13.3, 1998: 12.7, 1999: 11.9, 2000: 11.3, 2001: 11.7, 2002: 12.1, 2003: 12.5, 2004: 12.7, 2005: 12.6, 2006: 12.3, 2007: 12.5, 2008: 13.2, 2009: 14.3, 2010: 15.1, 2011: 15.0, 2012: 15.0, 2013: 14.8, 2014: 14.8, 2015: 13.5, 2016: 12.7, 2017: 12.3, 2018: 11.8, 2019: 10.5, 2020: 11.5, 2021: 11.6, 2022: 11.5, 2023: 11.1, 2024: 10.7, 2025: 10.2 };
export const INEQUALITY: Record<number, number> = { 1993: 40.5, 1994: 40.8, 1995: 41.4, 1996: 42.0, 1997: 42.8, 1998: 43.2, 1999: 43.8, 2000: 43.5, 2001: 42.5, 2002: 42.0, 2003: 42.4, 2004: 43.2, 2005: 44.0, 2006: 44.7, 2007: 45.2, 2008: 43.4, 2009: 43.2, 2010: 44.5, 2011: 44.3, 2012: 46.3, 2013: 45.0, 2014: 45.5, 2015: 45.6, 2016: 45.8, 2017: 46.1, 2018: 46.5, 2019: 46.8, 2020: 46.0, 2021: 46.5, 2022: 46.8, 2023: 47.0, 2024: 47.2 };
