"""convert date columns to string

Revision ID: e5999800b873
Revises: 46fb939569de
Create Date: 2026-05-10 12:23:41.195695

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5999800b873'
down_revision: Union[str, Sequence[str], None] = '46fb939569de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('users', 'created_at',
               existing_type=sa.DateTime(),
               type_=sa.String(length=50),
               postgresql_using="created_at::text",
               existing_nullable=True)
    op.alter_column('communities', 'created_at',
               existing_type=sa.DateTime(),
               type_=sa.String(length=50),
               postgresql_using="created_at::text",
               existing_nullable=True)
    op.alter_column('matches', 'match_date',
               existing_type=sa.DateTime(),
               type_=sa.String(length=50),
               postgresql_using="match_date::text",
               existing_nullable=False)
    op.alter_column('predictions', 'created_at',
               existing_type=sa.DateTime(),
               type_=sa.String(length=50),
               postgresql_using="created_at::text",
               existing_nullable=True)
    op.alter_column('predictions', 'updated_at',
               existing_type=sa.DateTime(),
               type_=sa.String(length=50),
               postgresql_using="updated_at::text",
               existing_nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('predictions', 'updated_at',
               existing_type=sa.String(length=50),
               type_=sa.DateTime(),
               postgresql_using="updated_at::timestamp",
               existing_nullable=True)
    op.alter_column('predictions', 'created_at',
               existing_type=sa.String(length=50),
               type_=sa.DateTime(),
               postgresql_using="created_at::timestamp",
               existing_nullable=True)
    op.alter_column('matches', 'match_date',
               existing_type=sa.String(length=50),
               type_=sa.DateTime(),
               postgresql_using="match_date::timestamp",
               existing_nullable=False)
    op.alter_column('communities', 'created_at',
               existing_type=sa.String(length=50),
               type_=sa.DateTime(),
               postgresql_using="created_at::timestamp",
               existing_nullable=True)
    op.alter_column('users', 'created_at',
               existing_type=sa.String(length=50),
               type_=sa.DateTime(),
               postgresql_using="created_at::timestamp",
               existing_nullable=True)
