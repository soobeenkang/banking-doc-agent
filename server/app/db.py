"""PostgreSQL 연결 풀"""

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .settings import DATABASE_URL

pool = ConnectionPool(DATABASE_URL, kwargs={"row_factory": dict_row}, open=False)
