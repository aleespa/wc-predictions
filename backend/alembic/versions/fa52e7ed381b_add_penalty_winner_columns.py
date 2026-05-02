"""add penalty winner columns

Revision ID: fa52e7ed381b
Revises: 9dec92f83b58
Create Date: 2026-05-02 15:38:58.714030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fa52e7ed381b'
down_revision: Union[str, Sequence[str], None] = '9dec92f83b58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add penalty_winner_id to matches
    with op.batch_alter_table('matches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('penalty_winner_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_matches_penalty_winner', 'teams', ['penalty_winner_id'], ['id'])
    
    # Add penalty_winner_id to predictions
    with op.batch_alter_table('predictions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('penalty_winner_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_predictions_penalty_winner', 'teams', ['penalty_winner_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('predictions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_predictions_penalty_winner', type_='foreignkey')
        batch_op.drop_column('penalty_winner_id')

    with op.batch_alter_table('matches', schema=None) as batch_op:
        batch_op.drop_constraint('fk_matches_penalty_winner', type_='foreignkey')
        batch_op.drop_column('penalty_winner_id')
