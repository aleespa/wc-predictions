"""add is_group_stage_locked

Revision ID: eaf9084e8e9a
Revises: fa52e7ed381b
Create Date: 2026-05-02 16:42:06.147886

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eaf9084e8e9a'
down_revision: Union[str, Sequence[str], None] = 'fa52e7ed381b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_group_stage_locked', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('is_group_stage_locked')
