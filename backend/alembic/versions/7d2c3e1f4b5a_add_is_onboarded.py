"""add is_onboarded

Revision ID: 7d2c3e1f4b5a
Revises: 46fb939569de
Create Date: 2026-05-11 18:15:30.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d2c3e1f4b5a'
down_revision: Union[str, Sequence[str], None] = '46fb939569de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('is_onboarded', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'is_onboarded')
